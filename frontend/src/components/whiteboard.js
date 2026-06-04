import React, { useEffect, useState, useContext, useRef } from "react";
import { getDocument } from "pdfjs-dist/build/pdf";
import PDFJSAnnotate from "../utils/PdfAnnotate/PDFJSAnnotate";
import 'pdfjs-dist/web/pdf_viewer.css';
import "./whiteboard.scss";
import { roomStore } from "../stores/room";
import { fileContext } from "./mediaboard";
import { toggleNext, togglePrev, toggleFirstLast } from "./whiteboard/control";
import FullScreen from './fullscreen/index';
import { t } from '../i18n';
import { getAnnotationEvents, getHexscrumProfile, getWorkspaceId, postAnnotationEvent } from '../utils/hexscrum-api';
import { addSnapshotAppliedListener } from '../utils/annotation-history';

(typeof window !== "undefined"
  ? window
  : {}
).pdfjsWorker = require("pdfjs-dist/build/pdf.worker.js");

const rtmClient = roomStore.rtmClient;

const resetBoardScroll = () => {
  const board = document.getElementById("Board");
  if (!board) return;
  window.__hexscrumApplyingRemoteScroll = true;
  board.scrollTop = 0;
  board.scrollLeft = 0;
  window.setTimeout(() => {
    window.__hexscrumApplyingRemoteScroll = false;
  }, 120);
};

export const sendToRemote = async (
  annotations,
  documentId,
  status,
  annotationId
) => {
  const rendering = {
    annotations: {
      annotations: annotations,
      documentId: documentId,
    },
    type: "annotation",
    status: status,
    annotationId: annotationId,
    senderUid: roomStore._state.me.uid,
  };
  try {
    await rtmClient.sendChannelMessage(JSON.stringify(rendering));
    roomStore.sendAnnotation(rendering);
  } catch(err) {}
};

const inferToolType = annotation => {
  if (!annotation) return '';
  if (Array.isArray(annotation)) return 'collection';
  return annotation.type || annotation.subtype || annotation.annotationType || annotation.mode || '';
};

const inferPageNumber = annotation => {
  if (!annotation || Array.isArray(annotation)) return 1;
  return Number(annotation.page || annotation.pageNumber || 1);
};

const eventField = (event, camelName, snakeName) => (
  event && event[camelName] !== undefined ? event[camelName] : event && event[snakeName]
);

const parseJsonField = (value) => {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const numberValue = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const hasBox = (annotation) => (
  annotation &&
  annotation.x !== undefined &&
  annotation.y !== undefined &&
  annotation.width !== undefined &&
  annotation.height !== undefined
);

const boxFromAnnotation = (annotation) => ({
  x: numberValue(annotation.x),
  y: numberValue(annotation.y),
  width: numberValue(annotation.width),
  height: numberValue(annotation.height),
});

const normalizeRenderableAnnotation = (annotation) => {
  if (!annotation || !annotation.type) return null;
  const next = { ...annotation };
  const rawType = String(next.type || '').toLowerCase();
  next.type = rawType === 'rectangle' || rawType === 'rect' ? 'area' : rawType === 'circle' ? 'ellipse' : rawType;

  if (next.type === 'highlight') {
    if (!Array.isArray(next.rectangles) || !next.rectangles.length) {
      if (!hasBox(next)) return null;
      next.rectangles = [boxFromAnnotation(next)];
    }
    next.rectangles = next.rectangles
      .map((rect) => ({
        x: numberValue(rect.x),
        y: numberValue(rect.y),
        width: numberValue(rect.width),
        height: numberValue(rect.height),
      }))
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return next.rectangles.length ? next : null;
  }

  if (next.type === 'area' || next.type === 'ellipse') {
    if (!hasBox(next) && Array.isArray(next.rectangles) && next.rectangles[0]) {
      Object.assign(next, boxFromAnnotation(next.rectangles[0]));
    }
    return hasBox(next) && numberValue(next.width) > 0 && numberValue(next.height) > 0 ? next : null;
  }

  if (next.type === 'line') {
    if (
      next.x1 === undefined &&
      next.y1 === undefined &&
      next.x2 === undefined &&
      next.y2 === undefined &&
      hasBox(next)
    ) {
      next.x1 = numberValue(next.x);
      next.y1 = numberValue(next.y);
      next.x2 = numberValue(next.x) + numberValue(next.width);
      next.y2 = numberValue(next.y) + numberValue(next.height);
    }
    return next.x1 !== undefined && next.y1 !== undefined && next.x2 !== undefined && next.y2 !== undefined ? next : null;
  }

  if (next.type === 'drawing') {
    return Array.isArray(next.lines) && next.lines.length ? next : null;
  }

  if (next.type === 'textbox') {
    return hasBox(next) || next.content ? next : null;
  }

  return null;
};

const normalizePersistedAnnotation = (event) => {
  const afterState = parseJsonField(eventField(event, 'afterState', 'after_state'));
  if (!afterState || Array.isArray(afterState) || typeof afterState !== 'object') return null;
  if (!afterState.type) return null;

  const annotationId = eventField(event, 'annotationId', 'annotation_id');
  const pageNumber = Number(eventField(event, 'pageNumber', 'page_number') || afterState.page || 1);
  return normalizeRenderableAnnotation({
    ...afterState,
    uuid: afterState.uuid || afterState.id || annotationId,
    class: afterState.class || 'Annotation',
    page: pageNumber,
  });
};

const reconstructAnnotationsByDocument = (events) => {
  const byDocument = {};
  (events || []).forEach((event) => {
    const documentId = eventField(event, 'documentId', 'document_id');
    if (!documentId) return;
    if (!byDocument[documentId]) byDocument[documentId] = [];

    const action = String(event.action || '').toLowerCase();
    const annotationId = eventField(event, 'annotationId', 'annotation_id');

    if (action === 'reset') {
      byDocument[documentId] = [];
      return;
    }

    if (action === 'deleted' || action === 'removed') {
      byDocument[documentId] = byDocument[documentId].filter((annotation) => (
        String(annotation.uuid || annotation.id || '') !== String(annotationId || '')
      ));
      return;
    }

    const annotation = normalizePersistedAnnotation(event);
    if (!annotation || !annotation.uuid) return;
    const index = byDocument[documentId].findIndex((item) => String(item.uuid) === String(annotation.uuid));
    if (index === -1) byDocument[documentId].push(annotation);
    else byDocument[documentId][index] = annotation;
  });
  return byDocument;
};

const trackAnnotationEvent = (action, documentId, annotation, annotationId, beforeState) => {
  try {
    const workspaceId = getWorkspaceId() || roomStore._state.course.rid || '';
    if (!workspaceId) return;

    const profile = getHexscrumProfile();
    const me = roomStore._state.me || {};
    postAnnotationEvent({
      workspaceId,
      documentId,
      pageNumber: inferPageNumber(annotation),
      annotationId: annotationId || (annotation && (annotation.uuid || annotation.id)) || '',
      action,
      toolType: inferToolType(annotation),
      userId: profile.userId || me.uid || '',
      userName: me.account || profile.name || '',
      userDesignation: profile.designation || '',
      userColor: profile.color || '',
      timestamp: new Date().toISOString(),
      beforeState: beforeState || null,
      afterState: annotation || null,
      payload: {
        source: 'pdfjs-annotate',
      },
    }).catch(() => {});
  } catch (err) {}
};

const Whiteboard = () => {
  const arrayStoreAdapterRef = useRef(null);
  const hydrationKeyRef = useRef('');
  if (!arrayStoreAdapterRef.current) {
    arrayStoreAdapterRef.current = new PDFJSAnnotate.ArrayStoreAdapter();
  }
  let arrayStoreAdapter = arrayStoreAdapterRef.current;

  const fileState = useContext(fileContext);

  // full screen boolean
  const [fullScreen, setFullScreen] = useState(false);

  var elements = [];
  fileState.pdfFiles.forEach(function (value) {
    elements.push(
      <div
        id={`viewerContainer${value}`}
        className={"pdfViewer " + (value === 1 ? "active" : "")}
        key={`${value}`}
      ></div>
    );
  });
  const hideLoader = () => {
    let elem = document.querySelector(".room-container .bar2");
    try {
      elem.parentNode.removeChild(elem);
    } catch (e) { }
  };
  useEffect(() => {
    if (
      !document
        .getElementById(
          `viewerContainer${fileState.pdfFiles[fileState.pdfFiles.length - 1]}`
        )
        .getElementsByTagName("svg").length
    )
      renderPdf(fileState.pdfFiles[fileState.pdfFiles.length - 1]);
  }, [fileState.pdfFiles]);

  const renderPdf = (pages, custom = 0) => {
    const { UI } = PDFJSAnnotate;
    let VIEWER;
    let data;
    let elementId;
    let check = false;
    if (!custom) {
      if (parseInt(pages, 10)) {
        data = require(`../assets/whiteboard/whiteboard-${pages}.pdf`);
      } else {
        check = true;
        data = pages;
      }
      VIEWER = document.getElementById(`viewerContainer${pages}`);
      elementId = `viewerContainer${pages}`;
      document
        .getElementsByClassName("pdfViewer active")[0]
        .classList.remove("active");
      document.getElementById(elementId).classList.add("active");
      resetBoardScroll();
    } else {
      PDFJSAnnotate.getStoreAdapter().resetAnnotation(
        document
          .querySelector("div.pdfViewer.active svg.customAnnotationLayer")
          .getAttribute("data-pdf-annotate-document")
      );
      document.getElementsByClassName("pdfViewer active")[0].innerHTML = "";
      data = pages;
      VIEWER = document.getElementsByClassName("pdfViewer active")[0];
      elementId = document.getElementsByClassName("pdfViewer active")[0].id;
    }
    const RENDER_OPTIONS = {
      documentId: data,
      pdfDocument: null,
      scale: 1,
      rotate: Number(fileState.viewerRotation) || 0,
      count: elementId,
    };
    getDocument(RENDER_OPTIONS.documentId).promise
      .then((pdf) => {
        if(check && Boolean(roomStore.uploadBy)) {
         alert(t('toast.upload_file'));
         hideLoader();
         roomStore.setUploadByme(0);
       }
        fileState.setTotalPages(pdf.numPages)
        RENDER_OPTIONS.pdfDocument = pdf;
        for (let i = 1; i <= pdf.numPages; i++) {
          VIEWER.appendChild(UI.createPage(i));
          UI.renderPage(i, RENDER_OPTIONS);
        }
      })
      .catch((error) => {
        // handle error
      });

    PDFJSAnnotate.setStoreAdapter(new PDFJSAnnotate.LocalStoreAdapter());
  };

  const renderActivePdfView = (rotation = 0) => {
    const { UI } = PDFJSAnnotate;
    const activeViewer = document.querySelector(".pdfViewer.active");
    if (!activeViewer || !activeViewer.id) return false;

    const documentId = activeViewer.id.replace("viewerContainer", "");
    if (!documentId || parseInt(documentId, 10)) return false;

    const normalizedRotation = ((Number(rotation) || 0) % 360 + 360) % 360;
    activeViewer.setAttribute("data-view-rotation", `${normalizedRotation}`);
    activeViewer.innerHTML = "";
    resetBoardScroll();

    const renderOptions = {
      documentId,
      pdfDocument: null,
      scale: 1,
      rotate: normalizedRotation,
      count: activeViewer.id,
    };

    getDocument(documentId).promise
      .then((pdf) => {
        fileState.setTotalPages(pdf.numPages);
        renderOptions.pdfDocument = pdf;
        for (let i = 1; i <= pdf.numPages; i++) {
          activeViewer.appendChild(UI.createPage(i));
          UI.renderPage(i, renderOptions);
        }
        const pageNumber = Math.max(1, Number(fileState.currentPage) || 1);
        window.setTimeout(() => {
          if (typeof window.__hexscrumSetPresentationPage === "function") {
            window.__hexscrumSetPresentationPage(pageNumber);
          }
          if (typeof window.__hexscrumUpdateBoardScale === "function") {
            window.__hexscrumUpdateBoardScale();
          }
        }, 160);
      })
      .catch(() => {});

    return true;
  };

  useEffect(() => {
    window.__hexscrumRotateActivePdfView = renderActivePdfView;
    return () => {
      delete window.__hexscrumRotateActivePdfView;
    };
  });
  useEffect(() => {
      PDFJSAnnotate.getStoreAdapter().addEvent(
        "annotation:added",
        (fingerprint, annotation) => {
          const uid  = roomStore._state.me.uid;
          arrayStoreAdapter.addAnnotation(fingerprint, annotation);
          trackAnnotationEvent("created", fingerprint, annotation, annotation && (annotation.uuid || annotation.id));
          sendToRemote(annotation, fingerprint, "annotation-added", uid);
        }
      );
      PDFJSAnnotate.getStoreAdapter().addEvent(
        "annotation:updated",
        (fingerprint, annotationId, annotation) => {
          arrayStoreAdapter.editAnnotation(
            fingerprint,
            annotationId,
            annotation
          );
          trackAnnotationEvent("updated", fingerprint, annotation, annotationId);
          sendToRemote(
            annotation,
            fingerprint,
            "annotation-updated",
            annotationId
          );
        }
      );
      PDFJSAnnotate.getStoreAdapter().addEvent(
        "annotation:removed",
        (fingerprint, annotationId) => {
          const uid  = roomStore._state.me.uid;
          arrayStoreAdapter.deleteAnnotation(fingerprint, annotationId).then((annotations) => {
          trackAnnotationEvent("deleted", fingerprint, { remainingAnnotations: annotations.length }, annotationId);
          sendToRemote(annotations, fingerprint, "annotation-removed", uid);
          });
        }
      );
      PDFJSAnnotate.getStoreAdapter().addEvent(
        "annotation:reset",
        (fingerprint) => {
          arrayStoreAdapter.resetAnnotation(fingerprint);
          trackAnnotationEvent("reset", fingerprint, { page: 1 }, "");
          sendToRemote("", fingerprint, "annotation-reset", "");
        }
      );
  }, []);

  useEffect(() => {
    return addSnapshotAppliedListener((event) => {
      const detail = event.detail || {};
      if (!detail.documentId) return;

      arrayStoreAdapter
        .resetAnnotation(detail.documentId)
        .then(() => arrayStoreAdapter.setAnnotations(detail.documentId, detail.annotations || []))
        .catch(() => {});
    });
  }, [arrayStoreAdapter]);

  const getRemoteAnnotationPage = (annotationPayload) => {
    if (Array.isArray(annotationPayload)) {
      return annotationPayload.length ? Number(annotationPayload[0].page || annotationPayload[0].pageNumber || 1) : 1;
    }
    if (!annotationPayload) return 1;
    return Number(annotationPayload.page || annotationPayload.pageNumber || 1);
  };

  const findAnnotationLayer = (documentId, pageNumber) => {
    return document.querySelector(
      `[data-pdf-annotate-document="${documentId}"][data-pdf-annotate-page="${pageNumber}"]`
    );
  };

  const clearAnnotationLayers = (documentId) => {
    let annotationLayers = document.querySelectorAll(
      `[data-pdf-annotate-document="${documentId}"]`
    );
    annotationLayers.forEach(function (item) {
      item.innerHTML = "";
    });
  };

  const renderRemoteAnnotations = (documentId, pageNumber, attempt = 0) => {
    const svg = findAnnotationLayer(documentId, pageNumber);
    if (!svg) {
      if (attempt < 30) {
        window.setTimeout(() => renderRemoteAnnotations(documentId, pageNumber, attempt + 1), 160);
      }
      return Promise.resolve(false);
    }

    return arrayStoreAdapter
      .getAnnotations(documentId, pageNumber)
      .then((renderData) => {
        const viewport = JSON.parse(svg.getAttribute("data-pdf-annotate-viewport"));
        return PDFJSAnnotate.render(svg, viewport, renderData);
      })
      .catch(() => false);
  };

  const renderRemoteAnnotationPages = (documentId, annotations) => {
    const pages = {};
    if (Array.isArray(annotations)) {
      annotations.forEach((annotation) => {
        pages[getRemoteAnnotationPage(annotation)] = true;
      });
    }

    if (!Object.keys(pages).length) {
      const layers = document.querySelectorAll(`[data-pdf-annotate-document="${documentId}"]`);
      layers.forEach((layer) => {
        const page = layer.getAttribute("data-pdf-annotate-page");
        if (page) pages[page] = true;
      });
    }

    return Promise.all(
      Object.keys(pages).map((page) => renderRemoteAnnotations(documentId, Number(page)))
    );
  };

  const writeRemoteAnnotationsToLocalStore = (documentId, annotations) => {
    const storeAdapter = PDFJSAnnotate.getStoreAdapter();
    if (storeAdapter && storeAdapter.setAnnotations) {
      return storeAdapter.setAnnotations(documentId, annotations);
    }
    return Promise.resolve(true);
  };

  const replaceRemoteAnnotations = (documentId, annotations) => {
    const nextAnnotations = Array.isArray(annotations) ? annotations : [];
    return PDFJSAnnotate
      .getStoreAdapter()
      .resetAnnotation(documentId, true)
      .then(() => arrayStoreAdapter.resetAnnotation(documentId))
      .then(() => writeRemoteAnnotationsToLocalStore(documentId, nextAnnotations))
      .then(() => arrayStoreAdapter.setAnnotations(documentId, nextAnnotations))
      .then(() => {
        clearAnnotationLayers(documentId);
        return renderRemoteAnnotationPages(documentId, nextAnnotations);
      })
      .catch(() => false);
  };

  useEffect(() => {
    const workspaceId = getWorkspaceId() || roomStore._state.course.rid || '';
    if (!workspaceId) return;

    const hydrationKey = `${workspaceId}:${fileState.pdfFiles.map(String).join('|')}`;
    if (hydrationKeyRef.current === hydrationKey) return;
    hydrationKeyRef.current = hydrationKey;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      getAnnotationEvents(workspaceId)
        .then((data) => {
          if (cancelled) return;
          const byDocument = reconstructAnnotationsByDocument(data.events || []);
          Object.keys(byDocument).forEach((documentId) => {
            replaceRemoteAnnotations(documentId, byDocument[documentId]);
          });
        })
        .catch(() => {});
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileState.pdfFiles.length]);

  useEffect(() => {

    try {
      const annotate = roomStore._state.annotatePdf;
      if (!annotate || !annotate.annotations) {
        return;
      }
      if (annotate.senderUid && `${annotate.senderUid}` === `${roomStore._state.me.uid}`) {
        return;
      }
      const remoteMessage = annotate.annotations;
      const documentId = remoteMessage.documentId;
      const annotationPayload = remoteMessage.annotations;
      const pageNumber = getRemoteAnnotationPage(annotationPayload);
      const status = annotate.status;

      switch(status) {
        case 'annotation-added' : {
          if(annotate.annotationId !== roomStore._state.me.uid && annotationPayload) {
            writeRemoteAnnotationsToLocalStore(documentId, [annotationPayload])
              .then(() => arrayStoreAdapter.setAnnotations(documentId, [annotationPayload]))
              .then(() => renderRemoteAnnotations(documentId, pageNumber))
              .catch(() => {});
          }
            break;
        }
        case 'annotation-updated': {
          if (annotationPayload) {
            writeRemoteAnnotationsToLocalStore(documentId, [annotationPayload])
              .then(() => arrayStoreAdapter
            .editAnnotation(
                documentId,
                annotate.annotationId,
                annotationPayload
              ))
              .then(() => renderRemoteAnnotations(documentId, pageNumber))
              .catch(() => {});
          }
            break;
        }
        case 'annotation-removed': {
          if(annotate.annotationId !== roomStore._state.me.uid) {
            replaceRemoteAnnotations(documentId, annotationPayload);
          }
            break;
        }
        case 'annotation-reset': {
          replaceRemoteAnnotations(documentId, []);
            break;
        } 
        case 'add-page': {
            fileState.fileDispatch({
              type: "remote-add-page",
            fileId: documentId,
            });
            break;
        }  
        case 'add-uploaded-page': {
            if(!Boolean(roomStore.uploadBy)) {
              fileState.fileDispatch({
                type: "remote-add-page",
              fileId: documentId,
              });
            }
            break;
        } 
        case 'remove-page': {
            arrayStoreAdapter.resetAnnotation(
            annotate.annotationId
            );
            let annotationLayers = document.querySelectorAll(
            `[data-pdf-annotate-document="${annotate.annotationId}"]`
            );
            annotationLayers.forEach(function (item) {
              item.innerHTML = "";
            });
            fileState.fileDispatch({
              type: "remote-remove-page",
            fileId: documentId,
            });
            break;
        }
        case 'next-page': {
            toggleNext(undefined, undefined, undefined, false);
            break;
        }
        case 'prev-page': {
            togglePrev(undefined, undefined, undefined, false);
            break;
        }
        case 'toggleFirstLast': {
          toggleFirstLast(annotate.annotationId, undefined, undefined, undefined, false);
            break;
        }        
        case 'sync-scroll': {
            const board = document.querySelector(".media-board");
            if (board) {
              window.__hexscrumApplyingRemoteScroll = true;
            board.scrollTop = annotate.annotationId;
              window.setTimeout(() => {
                window.__hexscrumApplyingRemoteScroll = false;
              }, 80);
            }
            break
        }
        case 'presentation-mode': {
            if (typeof window.__hexscrumSetPresentationMode === 'function') {
              window.__hexscrumSetPresentationMode(annotate.annotationId === 'on');
            }
            break;
        }
        case 'presentation-slide': {
            if (typeof window.__hexscrumSetPresentationPage === 'function') {
              window.__hexscrumSetPresentationPage(annotate.annotationId);
            }
            break;
        }
        default:
      }
    } catch (err) {
      // silent screen sharing error
    }
  }, [roomStore._state.annotatePdf.annotations]);


  let currentPage = fileState.currentPage;
  let totalPage = fileState.totalPage;

  return (
    <>
      <div id="main-container">
        {elements}
      </div>
      {
        roomStore._state.me.role === "teacher" ?
          <span className='PageDetail'>
            <h3>Page {currentPage}/{totalPage}</h3>
          </span> : null
      }
        <FullScreen />
    </>
  );
};
export default Whiteboard;
