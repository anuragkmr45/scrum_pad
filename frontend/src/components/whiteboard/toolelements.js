/* eslint-disable default-case */
import React, { useState, useContext, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { fileContext } from "../mediaboard";
import PDFJSAnnotate from "../../utils/PdfAnnotate/PDFJSAnnotate";
import NearMeIcon from '@material-ui/icons/NearMe';
import CreateIcon from '@material-ui/icons/Create';
import ColorizeIcon from '@material-ui/icons/Colorize';
import CropDinIcon from '@material-ui/icons/CropDin';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import TextFieldsIcon from '@material-ui/icons/TextFields';
import NoteAddIcon from '@material-ui/icons/NoteAdd';
import DeleteIcon from '@material-ui/icons/Delete';
import FormatColorTextIcon from '@material-ui/icons/FormatColorText';
import PublishIcon from '@material-ui/icons/Publish';
import KeyboardArrowLeftIcon from '@material-ui/icons/KeyboardArrowLeft';
import UI from "../../utils/PdfAnnotate/UI";
import { SketchPicker } from 'react-color';
import LineWeightIcon from '@material-ui/icons/LineWeight';
import PersonIcon from '@material-ui/icons/Person';
import { roomStore } from '../../stores/room';
import { useLocation } from 'react-router';
import { getHexscrumProfile, getWorkspaceId } from '../../utils/hexscrum-api';
import { registerSpreadsheetDocumentFromUpload } from '../../utils/spreadsheet-docs';

const Toolelements = () => {
  const [isPdf, showHighLight] = useState(false);
  let [tooltype, setToolType] = useState('cursor');
  let [thickness, changeThickness] = useState(1);
  let [color, changeColor] = useState('#EB5E28');
  let [colorPicker, setColorPicker] = useState(false);
  let [sizePicker, setSizePicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ top: 180, left: 92 });
  const [uploadStatus, setUploadStatus] = useState(null);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);

  const location = useLocation();

  var RENDER_OPTIONS = {
		documentId: 'default'
  };

  const emitToolChange = (nextTool = tooltype, nextColor = color, nextThickness = thickness) => {
    window.dispatchEvent(new CustomEvent('hexscrum:tool-change', {
      detail: {
        tool: nextTool,
        color: nextColor,
        thickness: nextThickness,
      },
    }));
  };

  const showTool = useMemo(() => {
    if (roomStore._state.course.allowAnnotation 
      && roomStore._state.me.role === 'teacher' 
      && (location.pathname.match(/big-class/) || location.pathname.match(/small-class/))) {
      return true
    }
    return false;
  }, [location.pathname, roomStore._state.me.role,roomStore._state.course.allowAnnotation]);

  useEffect(() => {

    //set for pen
    UI.setPen(thickness, color);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/pen/color', color);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/pen/size', thickness);

    // set for Text
    UI.setText(thickness, color, 0, tooltype === 'note' ? 'note' : 'text');
    localStorage.setItem(RENDER_OPTIONS.documentId + '/text/size', thickness);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/text/color', color);

    // set for line
    UI.setLine(thickness, color);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/line/size', thickness);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/line/color', color);

    //set for ellipse
    UI.setEllipse(thickness, color)
    localStorage.setItem(RENDER_OPTIONS.documentId + '/ellipse/size', thickness);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/ellipse/color', color);

    //set for Rectangle
    UI.setRect(thickness, color);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/rect/size', thickness);
    localStorage.setItem(RENDER_OPTIONS.documentId + '/rect/color', color);
    emitToolChange(tooltype, color, thickness);

  },[color, thickness, tooltype]);


  useEffect(() => {
 
    switch (tooltype) {
        case 'color':
          break;
        case 'cursor':
          UI.enableEdit();
          break;
        case 'draw':
          UI.disableEdit();
          UI.enablePen();
          break;
        case 'eraser':
          UI.disableEdit();
          UI.enableEraser();
          break;
        case 'text':
          UI.disableEdit();
          UI.setText(thickness, color, 0, 'text');
          UI.enableText();
          break;
        case 'note':
          UI.disableEdit();
          UI.setText(thickness, color, 0, 'note');
          UI.enableText();
          break;
        case 'line':
          UI.disableEdit();
          UI.enableLine();
          break;
        case 'point':
          UI.disableEdit();
          UI.enablePoint();
          break;
        case 'ellipse':
          UI.disableEdit();
          UI.enableEllipse();
          break;
        case 'area':
        case 'highlight':
        case 'underline':
        case 'strikeout':
          UI.disableEdit();
          UI.enableRect(tooltype);
          break;
          default:
            UI.disableEdit();
            UI.disablePen();
            UI.disableEraser();
            UI.disableText();
            UI.disableLine();
            UI.disableEllipse();
            UI.disableRect();      
          }
  },[tooltype])
  const handleToolbarClick  = (e) => {
      const type = e.currentTarget.getAttribute('data-annotation-type');
      if(colorPicker) {
        setColorPicker(false)
      }
      if(sizePicker) {
        setSizePicker(false)
      }
    if(type === tooltype) {
      return;
    } else {
      switch (tooltype) {
            case 'cursor':
              UI.disableEdit();
              break;
            case 'draw':
              UI.disablePen();
              break;
            case 'eraser':
              UI.disableEraser();
              break;
            case 'text':
            case 'note':
              UI.disableText();
              break;
            case 'line':
              UI.disableLine();
              break;
            case 'point':
              UI.disablePoint();
              break;
            case 'ellipse':
              UI.disableEllipse();
              break;
            case 'area':
            case 'highlight':
            case 'strikeout':
            case 'underline':
              UI.disableRect();
              break;
            case 'color':
             document.getElementsByClassName('.nav-colopiker').style.display = 'none'
          }
          setToolType(type);
          emitToolChange(type, color, thickness);
    }

  }


  const clearCurrentCanvasAnnotations = async () => {
    try {
      setClearModalOpen(false);
      const activeViewer = document.querySelector("div.pdfViewer.active");
      if (!activeViewer) return;

      const activeSpreadsheet = activeViewer.querySelector(".spreadsheet-review-canvas");
      if (activeSpreadsheet) {
        const spreadsheetDocumentId = activeSpreadsheet.getAttribute("data-document-id");
        window.dispatchEvent(new CustomEvent("hexscrum:clear-spreadsheet-overlays", {
          detail: { documentId: spreadsheetDocumentId },
        }));
      }

      const annotationLayers = Array.from(
        activeViewer.querySelectorAll("svg.customAnnotationLayer")
      );
      const documentIds = Array.from(
        new Set(
          annotationLayers
            .map((item) => item.getAttribute("data-pdf-annotate-document"))
            .filter(Boolean)
        )
      );

      annotationLayers.forEach(function (item) {
        item.innerHTML = "";
      });
      const editOverlay = document.getElementById("pdf-annotate-edit-overlay");
      if (editOverlay && editOverlay.parentNode) {
        editOverlay.parentNode.removeChild(editOverlay);
      }

      const storeAdapter = PDFJSAnnotate.getStoreAdapter();
      if (!storeAdapter || !storeAdapter.resetAnnotation || !documentIds.length) {
        return;
      }

      await Promise.all(
        documentIds.map((documentId) =>
          storeAdapter.resetAnnotation(documentId).catch(() => false)
        )
      );
    } catch (error) {
      // The modal has already closed; leave the canvas usable if a stale DOM node was hit.
    } finally {
      setClearModalOpen(false);
    }
  };

  const handleClearClick = (event) => {
    event && event.preventDefault();
    event && event.stopPropagation();
    setColorPicker(false);
    setSizePicker(false);
    setClearModalOpen(true);
  };

  const closeClearModal = (event) => {
    event && event.preventDefault();
    event && event.stopPropagation();
    setClearModalOpen(false);
  };
  const getPickerPosition = (event, width = 240, height = 320) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      top: Math.max(64, Math.min(window.innerHeight - height - 16, rect.top - 8)),
      left: Math.max(72, Math.min(window.innerWidth - width - 16, rect.right + 14)),
    };
  }

  const displayColorPicker = (event) => {
    event && event.stopPropagation();
    setSizePicker(false);
    if (event) {
      setPickerPosition(getPickerPosition(event, 240, 320));
    }
    setColorPicker((current) => !current);
  }

  const displaySizePicker = (event) =>  {
    event && event.stopPropagation();
    setColorPicker(false);
    if (event) {
      setPickerPosition(getPickerPosition(event, 250, 96));
    }
    setSizePicker((current) => !current);
  }

  const stopPickerEvent = (event) => {
    event && event.stopPropagation();
  }

  const handleThicknessChange = (event) => {
    const nextThickness = Number(event.target.value);
    changeThickness(nextThickness);
    emitToolChange(tooltype, color, nextThickness);
  }

  const showLoader = () => {
    let tag = document.createElement("div");
    tag.innerHTML = `<div class="bar2"></div>`;
    let element = document.querySelector(".room-container");
    element && element.prepend(tag);
  };
  const hideLoader = () => {
    let elem = document.querySelector(".room-container .bar2");
    try {
      elem.parentNode.removeChild(elem);
    } catch (e) { }
    setUploadStatus(null);
  };

  const fileState = useContext(fileContext);
  const canManageWorkspace = Boolean(fileState.canManageWorkspace || roomStore._state.me.role === 'teacher');
  const converterBaseUrl = (process.env.REACT_APP_LIBRE_BACKEND_URL || '').replace(/\/$/, '');
  const converterUploadUrl = converterBaseUrl
    ? (converterBaseUrl.match(/\/upload$/) ? converterBaseUrl : `${converterBaseUrl}/upload`)
    : '';
  const configuredMaxUploadMb = Number(process.env.REACT_APP_MAX_UPLOAD_MB || 25);
  const maxUploadMb = Number.isFinite(configuredMaxUploadMb) && configuredMaxUploadMb > 0 ? configuredMaxUploadMb : 25;

  useEffect(() => {
    const element = document.getElementsByClassName("pdfViewer active")[0].id
    if(element.length > 17) {
      showHighLight(true);
    } else {
      showHighLight(false);
    }
  },[fileState]);

  const handleUpload = () => {
    if (!canManageWorkspace) {
      alert("Only the lead reviewer can upload documents.");
      return;
    }
    try {
      showLoader();
      let files = document.getElementById("fileUpload").files;
      if (files) {
        let file = files[0];
        if (file) {
          const ext = (file.name.split('.').pop() || 'file').toUpperCase();
          setUploadStatus({
            fileName: file.name,
            fileType: ext,
            message: 'Uploading and converting document...'
          });
          let size = file.size / 1024 / 1024;
          if (checkFileSize(size)) {
            uploadViaConverter(file);
            document.getElementById("fileUpload").value = null;
          } else {
            alert(`File size should not be more than ${maxUploadMb}MB`);
            hideLoader();
            return;
          }
        } else {
          alert("File was not selected");
          hideLoader();
        }
      }
    } catch (e) {
     }
  };

  const checkFileSize = (size) => {
    if (size >= maxUploadMb) {
      return 0;
    }
    return 1;
  };

  async function uploadViaConverter(file) {
    if (!converterUploadUrl) {
      alert("Upload API URL is missing. Set REACT_APP_LIBRE_BACKEND_URL, for example http://localhost:4000.");
      hideLoader();
      return;
    }
    const profile = getHexscrumProfile();
    const workspaceId = getWorkspaceId() || roomStore._state.course.rid || '';
    const formData = new FormData();
    formData.append("sampleFile", file);
    formData.append("workspaceId", workspaceId);
    formData.append("userId", profile.userId || roomStore._state.me.uid || '');
    formData.append("userName", roomStore._state.me.account || profile.name || '');
    formData.append("userDesignation", profile.designation || '');
    formData.append("userColor", profile.color || '');
    try {
      const resp = await fetch(converterUploadUrl, {
        method: "POST",
        body: formData,
      });
      const contentType = resp.headers.get("content-type") || "";
      const raw = await resp.text();
      let data = {};
      if (raw && contentType.includes("application/json")) {
        try {
          data = JSON.parse(raw);
        } catch (err) {
          data = {};
        }
      }
      if (!resp.ok) {
        const htmlOrEmpty = !raw || raw.trim().startsWith("<!DOCTYPE") || raw.trim().startsWith("<html");
        const message = data.error ||
          (resp.status === 502 || htmlOrEmpty
            ? "Spreadsheet conversion timed out or Render restarted. Try a smaller file or retry after the backend wakes up."
            : raw || `Upload failed with status ${resp.status}.`);
        alert(message);
        hideLoader();
        return;
      }
      if (!Object.keys(data).length && raw) {
        try {
          data = JSON.parse(raw);
        } catch (err) {
          alert("Upload succeeded but the converter returned an unreadable response.");
          hideLoader();
          return;
        }
      }
      if (data.error) {
        alert(data.error);
        hideLoader();
        return;
      }
      setUploadStatus({
        fileName: file.name,
        fileType: data.documentKind === 'spreadsheet' && data.spreadsheetEditable ? 'SHEET' : 'PDF',
        message: data.spreadsheetWarning || 'Document ready. Syncing to workspace...'
      });
      registerSpreadsheetDocumentFromUpload(data);
      fileState.fileDispatch({ type: "upload-file", fileId: data.secure_url || data.url });
      if (data.spreadsheetWarning) {
        window.setTimeout(() => alert(data.spreadsheetWarning), 120);
      }
      hideLoader();
    } catch (error) {
      alert("Spreadsheet conversion timed out or the converter API is unreachable. Retry after the backend wakes up, or use a smaller file.");
      hideLoader();
    }
  }


  const inputFileRef = useRef(null);
  const popoverRoot = typeof document !== 'undefined' ? document.body : null;

  const handleFileUpload = () => {
    if (!canManageWorkspace) {
      alert("Only the lead reviewer can upload documents.");
      return;
    }
    if (!inputFileRef.current) {
      alert("Upload control is not ready yet. Please try again.");
      return;
    }
    /*Collecting node-element and performing click*/
    inputFileRef.current.click();
  }

  const ExitGrantWhiteboard =  async() => {
    try {
    const peeerId = roomStore._state.course.linkId;
    await roomStore.mute(`${peeerId}`, 'grantBoard');
    await roomStore.updateCourseLinkUid(0)
    } catch(err) {}
  }

  return (
    <>
      <div className={`menu ${toolbarCollapsed ? 'toolbar-collapsed' : ''}`}>
        <button
          type="button"
          className={`toolbar-collapse-toggle ${toolbarCollapsed ? 'edit-workspace-toggle' : ''}`}
          onClick={() => setToolbarCollapsed(!toolbarCollapsed)}
          aria-label={toolbarCollapsed ? 'Edit workspace' : 'Close side toolbar'}
        >
          {toolbarCollapsed ? <CreateIcon /> : <KeyboardArrowLeftIcon />}
          <span className="tooltiptext">{toolbarCollapsed ? 'Edit workspace' : 'Close tools'}</span>
        </button>
        {!toolbarCollapsed && canManageWorkspace ?
          <button
            type="button"
            className="toolbar-primary-action toolbar-upload-action"
            onClick={handleFileUpload}
            aria-label="Upload document"
          >
            <PublishIcon />
            <span className="tooltiptext">Upload document</span>
          </button> : null}
        {!toolbarCollapsed ? <div className="nav annotation-toolbar">
        <div className="menu-mat-icons">
            <NearMeIcon
            data-annotation-type="cursor"
            className= { tooltype === 'cursor' ? 'icon items active' : 'icon items'}
            onClick = {handleToolbarClick}
            />
            <span className="tooltiptext">Cursor</span>
          </div>
          <div className="menu-mat-icons">
              <CreateIcon
              data-annotation-type="draw"
              className= { tooltype === 'draw' ? 'icon items active' : 'icon items'}
              onClick = {handleToolbarClick}
              />
              <span className="tooltiptext">Pencil</span>
          </div>
          <div onClick={displayColorPicker} className="menu-mat-icons">
            <ColorizeIcon
              data-annotation-type="color"
              className= {colorPicker ? 'icon items color_pick active' : 'icon items color_pick'}
            />
            <span className="tooltiptext">Pencil Color</span>
          </div>
            <div onClick={displaySizePicker} className="menu-mat-icons">
            <LineWeightIcon
              data-annotation-type="size"
              className= {sizePicker ? 'icon items size_pick active' : 'icon items size_pick'}
            />
            <span className="tooltiptext">Thickness</span>
          </div>

          <div className="menu-mat-icons">
            <i
              data-annotation-type="line"
              className= { tooltype === 'line' ? 'icon items line active' : 'icon items line'}
              onClick = {handleToolbarClick}
            />
            <span className="tooltiptext">Line</span>
          </div>
          <div className="menu-mat-icons">
              <CropDinIcon
               data-annotation-type="area"
               className= { tooltype === 'area' ? 'icon items active' : 'icon items'}
               onClick = {handleToolbarClick}
              />
              <span className="tooltiptext">Rectangle</span>
          </div>
          <div className="menu-mat-icons">
              <RadioButtonUncheckedIcon 
               data-annotation-type="ellipse"
               className= { tooltype === 'ellipse' ? 'icon items active' : 'icon items'}
               onClick = {handleToolbarClick}
              />
              <span className="tooltiptext">Ellipse</span>
          </div>
          <div className="menu-mat-icons">
              <TextFieldsIcon
               data-annotation-type="text"
               className= { tooltype === 'text' ? 'icon items active' : 'icon items'}
               onClick = {handleToolbarClick}
              />
              <span className="tooltiptext">Text</span>
          </div>
          <div className="menu-mat-icons">
              <NoteAddIcon
               data-annotation-type="note"
               className= { tooltype === 'note' ? 'icon items active' : 'icon items'}
               onClick = {handleToolbarClick}
              />
              <span className="tooltiptext">Note</span>
          </div>
          <div className="menu-mat-icons">
              <i
                data-annotation-type="eraser"
                className= { tooltype === 'eraser' ? 'icon items eraser active' : 'icon items eraser'}
                onClick = {handleToolbarClick}
              />
              <span className="tooltiptext">Eraser</span>
          </div>
          {canManageWorkspace ?
          <div onClick={handleClearClick} className="menu-mat-icons">
              <DeleteIcon
               data-annotation-type="clear"
               className= { tooltype === 'clear' ? 'icon items active' : 'icon items'}
              />
              <span className="tooltiptext">Clear All</span>
          </div> : null}
          {
            isPdf ?
            <div className='menu-mat-icons'>
            <FormatColorTextIcon
              data-annotation-type="highlight"
              className= { tooltype === 'highlight' ? 'icon items active' : 'icon items'}
              style = {{display: 'block'}}
              onClick = {handleToolbarClick}
            />
            <span className="tooltiptext">Highlight Text</span>
            </div> :
           <>
           <FormatColorTextIcon
             data-annotation-type="highlight"
             className= { tooltype === 'highlight' ? 'icon items active' : 'icon items'}
               style = {{display: 'none'}}
               onClick = {handleToolbarClick}
           />
           <span className="tooltiptext">Highlight Text</span>
          </>
          }
          {
            showTool ?
            <>
            <PersonIcon style={{ color: '#EB5E28' }} onClick = {ExitGrantWhiteboard} className = 'icon items' />
            <span className="tooltiptext">cancel annotation</span>
            </>
            : null
          }
        </div> : null}
      </div>
      {popoverRoot ? ReactDOM.createPortal(
        <>
          {colorPicker ?
            <div
              className="toolbar-settings-popover toolbar-color-popover"
              style={{ top: pickerPosition.top, left: pickerPosition.left }}
              onClick={stopPickerEvent}
              onMouseDown={stopPickerEvent}
              onPointerDown={stopPickerEvent}
            >
              <SketchPicker
                color={color}
                onChange={(nextColor) => {
                  changeColor(nextColor.hex)
                }}
                onChangeComplete={(nextColor) => {
                  changeColor(nextColor.hex)
                }}
              />
            </div> : null}
          {sizePicker ?
            <div
              className="toolbar-settings-popover toolbar-thickness-popover"
              style={{ top: pickerPosition.top, left: pickerPosition.left }}
              onClick={stopPickerEvent}
              onMouseDown={stopPickerEvent}
              onPointerDown={stopPickerEvent}
            >
              <div className="rangeslider-box">
                <label htmlFor="penThicknessRange">Thickness</label>
                <div className="slider">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={thickness}
                    className="slider-color"
                    id="penThicknessRange"
                    onInput={handleThicknessChange}
                    onChange={handleThicknessChange}
                  />
                  <span className="thickness-value">{thickness}px</span>
                </div>
              </div>
            </div> : null}
        </>,
        popoverRoot
      ) : null}
      {canManageWorkspace ?
        <input
          type="file"
          id="fileUpload"
          ref={inputFileRef}
          onChange={handleUpload}
          accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.odp,.ods,.png,.jpg,.jpeg"
          className="toolbar-file-input"
          tabIndex={-1}
          aria-hidden="true"
        /> : null}
      {clearModalOpen && popoverRoot ? ReactDOM.createPortal(
        <div
          className="clear-modal-backdrop"
          role="presentation"
          onClick={closeClearModal}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="clear-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clearAnnotationsTitle"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span>Clear annotations</span>
            <h2 id="clearAnnotationsTitle">Clear the current canvas?</h2>
            <p>This removes all annotations on the active canvas for everyone in the workspace. Uploaded documents stay available.</p>
            <div className="clear-modal-actions">
              <button type="button" onClick={closeClearModal}>Cancel</button>
              <button type="button" className="danger" onClick={clearCurrentCanvasAnnotations}>Clear all</button>
            </div>
          </div>
        </div>,
        popoverRoot
      ) : null}
      {uploadStatus ?
        <div className="upload-progress-overlay" role="status" aria-live="polite">
          <div className="upload-progress-card">
            <div className="upload-file-icon">{uploadStatus.fileType}</div>
            <div>
              <strong>{uploadStatus.fileName}</strong>
              <span>{uploadStatus.message}</span>
            </div>
          </div>
        </div> : null}
    </>
  );
};
export default Toolelements;
