import React, { useMemo, useEffect, useState, useReducer, useRef } from 'react';
import Whiteboard from './whiteboard';
import Control from './whiteboard/control';
import { useLocation } from 'react-router';
import { useRoomState, useGlobalState } from '../containers/root-container';
import { roomStore } from '../stores/room';
import { globalStore } from '../stores/global';
import { t } from '../i18n';
import Toolelements from './whiteboard/toolelements';
import { sendToRemote } from './whiteboard';
import LocalStoreAdapter from '../utils/PdfAnnotate/adapter/LocalStoreAdapter';
import { RoomMessage } from '../utils/agora-rtm-client';
import PDFJSAnnotate from '../utils/PdfAnnotate/PDFJSAnnotate';
import { getWorkspace, getWorkspaceId } from '../utils/hexscrum-api';


interface MediaBoardProps {
  handleClick?: (type: string) => void
  children?: any
}

export const fileContext = React.createContext({} as any);

const appendFile = (state: any[], fileId: any) => {
  if (!fileId || state.some((value: any) => String(value) === String(fileId))) {
    return state;
  }
  return [...state, fileId];
};

const uploadedFilesFrom = (files: any[]) => {
  return files.filter((value: any) => typeof value === 'string' && /^https?:\/\//.test(value));
};

const parseSharedUploadedFiles = (value: any) => {
  if (!value || typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item: any) => typeof item === 'string' && /^https?:\/\//.test(item));
    }
  } catch (err) {
    if (/^https?:\/\//.test(value)) {
      return [value];
    }
  }
  return [];
};

const fileReducer = (state: any, action: any) => {
  let whiteBaordFiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let availableFiles = [];
  switch (action.type) {
    case 'add-page':
      availableFiles = whiteBaordFiles.filter(function (obj) { return state.indexOf(obj) === -1; });
      if (availableFiles.length > 0) {
          if(availableFiles.length === 1) {
            document.getElementById('add_page')!.style.display = 'none';
          }
          alert(t('toast.add_page'));
          sendToRemote("", availableFiles[0], "add-page", "");
          return [...state, availableFiles[0]];
      }
      return state;
    case 'remove-page':
      let id = document.getElementsByClassName('pdfViewer active')[0].id.replace('viewerContainer','');

       // Removing from local storage
       let LocalStore  = new LocalStoreAdapter();

       let annotationLayers = document.querySelectorAll(
         "div.pdfViewer.active svg.customAnnotationLayer"
       );
       annotationLayers.forEach(function (item) {
         item.innerHTML = "";
       });

      LocalStore.resetAnnotation(
       document!.querySelector("div.pdfViewer.active svg.customAnnotationLayer")!.getAttribute("data-pdf-annotate-document")
      )
 
      if(id !== '1') {
        let pageId = document.getElementById(`viewerContainer${id}`)!.getElementsByTagName('svg')[0].getAttribute('data-pdf-annotate-document');
        let updatedFiles = state.filter(function (value: any, index: any) {
          return value != id;
        });
        document.getElementsByClassName('pdfViewer active')[0].previousElementSibling?.classList.add('active');

        // show add button
        availableFiles = whiteBaordFiles.filter(function (obj) { return updatedFiles.indexOf(obj) == -1; });
        if(availableFiles.length > 0) {
          document.getElementById('add_page')!.style.display = 'block';
        }
        alert(t('toast.remove_page'));
        sendToRemote("", updatedFiles, "remove-page", pageId);
        roomStore.updateWhiteboardUid(JSON.stringify(uploadedFilesFrom(updatedFiles))).catch(() => {});
        return updatedFiles;
      }
      return state;
    case 'upload-file':
      const nextState = appendFile(state, action.fileId);
      if (nextState === state) return state;
      sendToRemote("", action.fileId, "add-uploaded-page", "");
      roomStore.setUploadByme(1);
      roomStore.updateWhiteboardUid(JSON.stringify(uploadedFilesFrom(nextState))).catch(() => {});
      return nextState;
    case 'remote-add-page':
      return appendFile(state, action.fileId);
    case 'remote-remove-page':
      document.getElementsByClassName('pdfViewer active')[0].previousElementSibling?.classList.add('active');
      return action.fileId;
    default:
      return state;
  }
}

const MediaBoard: React.FC<MediaBoardProps> = ({
  handleClick,
  children
}) => {

  const roomState = useRoomState();
  const role = roomState.me.role;
  const me = roomState.me;

  const handlePageTool: any =  (evt: any, type: string) => {

    if (type === 'peer_hands_up') {
      globalStore.showDialog({
        type: 'apply',
        message: `${globalStore.state.notice.text}`,
      })
    }

    if (type === 'hands_up') {

      if(roomStore.state.course.allowAnnotation) {
        globalStore.showToast({
          message: t('toast.teacher_already_acpt_whiteboard'),
          type: 'notice'
        });
        return;
      }

      if (roomStore.state.course.teacherId) {
        // rtmLock.current = true;
        roomStore.rtmClient.sendPeerMessage(roomStore.state.course.teacherId,
          { cmd: RoomMessage.unmuteBoard })
          .then((result: any) => {
            console.log("peerMessage result ", result);
          })
          .catch(console.warn)
          .finally(() => {
            globalStore.showToast({
              message: t('toast.raised_hand'),
              type: 'notice'
            });
            // rtmLock.current = false;
          })
      } else {
        globalStore.showToast({
          message: t('toast.interact_not_allowed'),
          type: 'notice'
        });
      }
    }

    if (type === 'hands_up_end') {
      if (roomStore.state.course.teacherId) {
       // rtmLock.current = true;
        roomStore.rtmClient.sendPeerMessage(roomStore.state.course.teacherId,
          { cmd: RoomMessage.muteBoard })
          .then((result: any) => {
            console.log("peerMessage result ", result);
          })
          .catch(console.warn)
          .finally(() => {
           // rtmLock.current = false;
          })
      }
    }

    // if (handleClick) {
    //   handleClick(type);
    // }
  }

  const isHost = useMemo(() => {
    return +roomStore.state.me.uid === +roomStore.state.course.linkId;
  }, []);

  const location = useLocation();
  const isLiveReview = useMemo(() => Boolean(location.pathname.match(/one-to-one/)), [location.pathname]);
  const canAnnotate = useMemo(() => {
    return me.role === 'teacher' || isLiveReview || Boolean(me.grantBoard);
  }, [isLiveReview, me.grantBoard, me.role]);
  const canManageWorkspace = useMemo(() => me.role === 'teacher', [me.role]);

  const showControl: boolean = useMemo(() => {
    if (me.role === 'teacher') return true;
    if (isLiveReview && canAnnotate) return true;
    if (location.pathname.match(/big-class/) || location.pathname.match(/small-class/)) {
      if (me.role === 'student') {
        return true;
      }
    }
    return false;
  }, [canAnnotate, isLiveReview, location.pathname, me.role]);

  const drawable: string = useMemo(() => {
    if (location.pathname.match('small-class|big-class')) {
      if (me.role === 'teacher') {
        return 'drawable';
      }
      if (me.role === 'student') {
        if (Boolean(me.grantBoard)) {
          return 'drawable';
        } else {
          return 'panel';
        }
      }
    }
    return 'drawable';
  }, [me.role, me.grantBoard, location]);

  const globalState = useGlobalState();

  const files = [1];

  const [pdfFiles, dispatch] = useReducer(fileReducer, files);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPage, setTotalPages] = useState(1);
  const scrollSyncTimer = useRef<number | null>(null);
  const lastScrollSentAt = useRef(0);

  const updateBoardScale = () => {
    const board = document.getElementById('Board') as HTMLElement | null;
    if (!board) return;

    const activeViewer = board.querySelector('.pdfViewer.active') as HTMLElement | null;
    const activePage = activeViewer && activeViewer.querySelector('.page') as HTMLElement | null;
    const pageWidth = activePage
      ? Number(activePage.getAttribute('data-pdf-width')) || activePage.offsetWidth
      : 0;
    const boardWidth = board.clientWidth || window.innerWidth;
    const compact = window.matchMedia('(max-width: 1180px)').matches;
    const verySmall = window.matchMedia('(max-width: 680px)').matches;
    const leftGutter = compact ? (verySmall ? 78 : 98) : 126;
    const rightGutter = compact ? (verySmall ? 18 : 34) : 72;
    const availableWidth = Math.max(260, boardWidth - leftGutter - rightGutter);
    const scale = compact && pageWidth
      ? Math.min(1, Math.max(0.52, availableWidth / pageWidth))
      : 1;

    board.style.setProperty('--hexscrum-board-scale', scale.toFixed(3));
    board.style.setProperty('--hexscrum-board-left-gutter', `${leftGutter}px`);
    board.style.setProperty('--hexscrum-board-right-gutter', `${rightGutter}px`);
  };

  useEffect(() => {
    const sharedFiles = [
      ...parseSharedUploadedFiles(roomState.course.boardId),
      ...roomState.users
        .toArray()
        .reduce((acc: string[], user: any) => acc.concat(parseSharedUploadedFiles(user.boardId)), []),
    ];
    sharedFiles.forEach((fileId: string) => {
      dispatch({ type: 'remote-add-page', fileId });
    });
  }, [roomState.course.boardId, roomState.users]);

  useEffect(() => {
    const workspaceId = getWorkspaceId() || roomStore.state.course.rid || '';
    if (!workspaceId) return;

    let cancelled = false;
    getWorkspace(workspaceId)
      .then((data: any) => {
        if (cancelled) return;
        const documents = ((data && data.workspace && data.workspace.documents) || [])
          .slice()
          .sort((first: any, second: any) => String(first.created_at || '').localeCompare(String(second.created_at || '')));
        documents.forEach((document: any) => {
          const fileUrl = document.converted_pdf_url || document.convertedPdfUrl || document.storage_url || document.storageUrl || '';
          if (fileUrl) {
            dispatch({ type: 'remote-add-page', fileId: fileUrl });
          }
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  },[pdfFiles]);

  useEffect(() => {
    updateBoardScale();
    const board = document.getElementById('Board');
    if (!board) return undefined;

    const ResizeObserverCtor = (window as any).ResizeObserver;
    const resizeObserver = ResizeObserverCtor
      ? new ResizeObserverCtor(() => updateBoardScale())
      : null;
    resizeObserver && resizeObserver.observe(board);

    const mutationObserver = new MutationObserver(() => {
      window.requestAnimationFrame(updateBoardScale);
    });
    mutationObserver.observe(board, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-pdf-width', 'style'],
    });

    const onResize = () => updateBoardScale();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const timer = window.setTimeout(updateBoardScale, 350);

    return () => {
      resizeObserver && resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFiles.length, currentPage, location.pathname]);

  useEffect(() => {
    // disable all pdf effect on grandboard false
    if(!canAnnotate) {
      let { UI } = PDFJSAnnotate;
      UI.disableEdit();
      UI.disablePen();
      UI.disableEraser();
      UI.disableText();
      UI.closeInput();
      UI.disableLine();
      UI.disablePoint();
      UI.disableEllipse();
      UI.disableRect();
      }    
  },[canAnnotate])

  function getMostVisibleElement(selector: any) : any {
    let clientRect = null;
    let clientRectTop = 0;
    let maxVisibleHeight = 0;
    let visibleHeightOfElem = 0;
    let mostVisibleElement = null;
    let skipRest = false;

    selector.forEach(function(element: any) {

        if (skipRest === false) {
            clientRect = element.getBoundingClientRect();
            clientRectTop = Math.abs(clientRect.top);

            if (clientRect.top >= 0) {
                visibleHeightOfElem = window.innerHeight - clientRectTop;
            } else {
                visibleHeightOfElem = clientRect.height - clientRectTop;
            }

            if (visibleHeightOfElem >= clientRect.height) {
                mostVisibleElement = element;
                skipRest = true;
            } else {

                if (visibleHeightOfElem > maxVisibleHeight) {
                    maxVisibleHeight = visibleHeightOfElem;
                    mostVisibleElement = element;
                }
            }

        }
    });
    return mostVisibleElement;
}

  const handleScroll = () => {

    if(canManageWorkspace && !(window as any).__hexscrumApplyingRemoteScroll) {
      const sendScrollPosition = () => {
        const board = document.querySelector('.media-board') as HTMLElement | null;
        if (!board) return;
        lastScrollSentAt.current = Date.now();
        sendToRemote("", "", "sync-scroll", board.scrollTop);
      };
      const elapsed = Date.now() - lastScrollSentAt.current;
      if (elapsed >= 120) {
        if (scrollSyncTimer.current) {
          window.clearTimeout(scrollSyncTimer.current);
          scrollSyncTimer.current = null;
        }
        sendScrollPosition();
      } else if (!scrollSyncTimer.current) {
        scrollSyncTimer.current = window.setTimeout(() => {
          scrollSyncTimer.current = null;
          sendScrollPosition();
        }, 120 - elapsed);
      }

    try {
      let elements = document.querySelectorAll('.pdfViewer.active');
    let  VisibleElement = getMostVisibleElement(elements[0].childNodes)

    if (VisibleElement !== null) {
      let VisibleElementId = VisibleElement.id
      let pageNumber = VisibleElementId.substring(13);
      setCurrentPage(pageNumber);
    }
    } catch (err) {
        // error handler
    }
  }
}

  return (
    <div id='Board' className={`media-board ${drawable}`} onScroll={handleScroll}>
      {
        <>
        <fileContext.Provider value={{
          pdfFiles: pdfFiles,
          fileDispatch: dispatch,
          setTotalPages: setTotalPages,
          currentPage: currentPage,
          totalPage: totalPage
          }}>
          <Whiteboard />
        </fileContext.Provider>
         </>
      }
      <div className="layer">
        <>
          {canAnnotate ? <fileContext.Provider value={{pdfFiles: pdfFiles, fileDispatch: dispatch, canManageWorkspace}}><Toolelements /></fileContext.Provider> : null}
        </>
        {children ? children : null}
      </div>
      { showControl ?
      <fileContext.Provider value={{pdfFiles: pdfFiles, fileDispatch: dispatch, setTotalPages: setTotalPages, canAnnotate, canManageWorkspace}}>
      <Control
        isHost={isHost}
        notice={globalState.notice}
        role={role}
        onClick={handlePageTool}/>
        </fileContext.Provider> : null }
    </div>
  )
};
export default React.memo(MediaBoard);
