import React, { useMemo, useContext, useEffect, useState, useRef } from 'react';
import Icon from '../icon';
import PollCard from '../../components/poll/index'
import usePollData from '../../hooks/use-poll-data';
import { useLocation } from 'react-router';
import { roomStore } from '../../stores/room';
import { globalStore } from '../../stores/global';
import { t } from '../../i18n';
import { sendToRemote } from '../whiteboard';
import { fileContext } from '../mediaboard';
import FirstPageIcon from '@material-ui/icons/FirstPage';
import ArrowBackIosIcon from '@material-ui/icons/ArrowBackIos';
import ArrowForwardIosIcon from '@material-ui/icons/ArrowForwardIos';
import LastPageIcon from '@material-ui/icons/LastPage';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import RemoveCircleOutlineOutlinedIcon from '@material-ui/icons/RemoveCircleOutlineOutlined';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import CreateIcon from '@material-ui/icons/Create';
import CreateOutlinedIcon from '@material-ui/icons/CreateOutlined';
import { green } from '@material-ui/core/colors';
import RecordRTCPromisesHandler from 'recordrtc';
import GetAppIcon from '@material-ui/icons/GetApp';
import StopIcon from '@material-ui/icons/Stop';
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';
import UndoIcon from '@material-ui/icons/Undo';
import RedoIcon from '@material-ui/icons/Redo';
import RotateRightIcon from '@material-ui/icons/RotateRight';
import { undoAnnotations, redoAnnotations, getAnnotationHistoryState, addHistoryStateListener } from '../../utils/annotation-history';


interface ControlItemProps {
  name: string
  onClick: (evt: any, name: string) => void
  text?: string
}

const ControlItem = (props: ControlItemProps) => {
  const onClick = (evt: any) => {
    props.onClick(evt, props.name);
  }

  return (
    props.text ?
      <div className={`control-btn control-${props.name}`} onClick={onClick}>
        <div className={`btn-icon ${props.name} `}
          data-name={props.name} />
        <div className="control-text">{props.text}</div>
      </div>
      :
      <Icon
        bubbleCount={roomStore._state.vt}
        data={props.name}
        onClick={onClick}
        className={`items ${props.name} `}
      />
  )
}

interface NoticeProps {
  reason: string
  text?: string
}

interface ControlProps {
  isHost?: boolean
  role: string
  notice?: NoticeProps
  onClick: (evt: any, type: string) => void
}

type ExportOrientation = 'auto' | 'portrait' | 'landscape';

type ExportCanvasOption = {
  id: string
  label: string
  pageCount: number
}
export const toggleNext = (
  setCanvasNumber?: any,
  pdfFiles: any = [],
  setTotalPages?: any,
  shouldBroadcast: boolean = true
) => {
  let current = document.getElementsByClassName('pdfViewer active')[0];
  if (!current) return;
  let next = current.nextElementSibling;
  if (next) {
    globalStore.showToast({
      type: 'notice-board',
      message: t('toast.toggle_page')
    });
    if (shouldBroadcast) {
      sendToRemote("", "", "next-page", "");
    }
    current.classList.remove('active');
    next.classList.add('active');

    if (typeof setCanvasNumber === 'function' && Array.isArray(pdfFiles)) {
      // changing current canvas number
      const currentCanvasNumber = next.id.substring(15);
      if (isNaN(parseInt(currentCanvasNumber))) {
        const currentCanvasIndex = pdfFiles.indexOf(currentCanvasNumber)
        setCanvasNumber(currentCanvasIndex + 1)
      } else {
        const currentCanvasIndex = pdfFiles.indexOf(parseInt(currentCanvasNumber));
        setCanvasNumber(currentCanvasIndex + 1);
      }
    }

    if (typeof setTotalPages === 'function') {
      // set total pages in canvas
      let totalPages = next?.childElementCount;
      setTotalPages(totalPages)
    }
  }
}

export const togglePrev = (
  setCanvasNumber?: any,
  pdfFiles: any = [],
  setTotalPages?: any,
  shouldBroadcast: boolean = true
) => {
  let current = document.getElementsByClassName('pdfViewer active')[0];
  if (!current) return;
  let previous = current.previousElementSibling;

  if (previous) {
    globalStore.showToast({
      type: 'notice-board',
      message: t('toast.toggle_page')
    });
    if (shouldBroadcast) {
      sendToRemote("", "", "prev-page", "");
    }
    current.classList.remove('active');
    previous.classList.add('active');

    if (typeof setCanvasNumber === 'function' && Array.isArray(pdfFiles)) {
      // changing current canvas number
      const currentCanvasNumber = previous.id.substring(15);

      if (isNaN(parseInt(currentCanvasNumber))) {
        const currentCanvasIndex = pdfFiles.indexOf(currentCanvasNumber)
        setCanvasNumber(currentCanvasIndex + 1)
      } else {
        const currentCanvasIndex = pdfFiles.indexOf(parseInt(currentCanvasNumber))
        setCanvasNumber(currentCanvasIndex + 1)
      }
    }

    if (typeof setTotalPages === 'function') {
      // set total pages in a canvas
      let totalPages = previous?.childElementCount;
      setTotalPages(totalPages)
    }

  }
}

export const toggleFirstLast = (
  item: any,
  setCanvasNumber?: any,
  pdfFiles: any = [],
  setTotalPages?: any,
  shouldBroadcast: boolean = true
) => {

  const container = document.getElementById('main-container');
  if (!container) return;

  if (item === "first" && (container.firstChild as HTMLElement).classList.contains('active')) {
    return;
  } else if (item === "last" && (container.lastChild as HTMLElement).classList.contains('active')) {
    return;
  }

  let current = document.getElementsByClassName('pdfViewer active')[0];
  if (!current) return;

  if (shouldBroadcast) {
    sendToRemote("", "", 'toggleFirstLast', item);
  }

  globalStore.showToast({
    type: 'notice-board',
    message: t('toast.toggle_page')
  });

  current.classList.remove('active');
  document.querySelector(`.pdfViewer:${item}-child`)!.classList.add('active');

  if (typeof setCanvasNumber === 'function' && Array.isArray(pdfFiles)) {

    let totalPages = null;
    if (item === 'first') {
      if (typeof setTotalPages === 'function') {
        setTotalPages(1);
      }
      // set current canvas number to 1
      setCanvasNumber(1);
    } else {
      // set current canvas number to last
      const value = document.querySelector(`.pdfViewer:${item}-child`)?.id.substring(15);

      if (isNaN(parseInt(value!))) {
        const currentCanvasIndex = pdfFiles.indexOf(value)
        setCanvasNumber(currentCanvasIndex + 1);
      } else {
        const currentCanvasIndex = pdfFiles.indexOf(parseInt(value!))
        setCanvasNumber(currentCanvasIndex + 1)
      }
    }

    if (typeof setTotalPages === 'function') {
      // set total pages for current active canvas
      totalPages = document.getElementsByClassName('pdfViewer active')[0].childElementCount;
      setTotalPages(totalPages)
    }
  }
}

function getExportCanvasOptions(): ExportCanvasOption[] {
  const viewers = Array.from(
    document.querySelectorAll('#main-container > .pdfViewer')
  ) as HTMLElement[];

  return viewers.map((viewer, index) => ({
    id: viewer.id,
    label: `Canvas ${index + 1}`,
    pageCount: viewer.querySelectorAll('.page').length || 1,
  }));
}

function rotateCanvas(source: HTMLCanvasElement, rotation: number) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  if (normalizedRotation === 0) return source;

  const output = document.createElement('canvas');
  const swapSize = normalizedRotation === 90 || normalizedRotation === 270;
  output.width = swapSize ? source.height : source.width;
  output.height = swapSize ? source.width : source.height;

  const context = output.getContext('2d');
  if (!context) return source;

  context.translate(output.width / 2, output.height / 2);
  context.rotate((normalizedRotation * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);

  return output;
}

function getPdfOrientation(
  requestedOrientation: ExportOrientation,
  canvas: HTMLCanvasElement
) {
  if (requestedOrientation === 'portrait') return 'p';
  if (requestedOrientation === 'landscape') return 'l';
  return canvas.width >= canvas.height ? 'l' : 'p';
}

export default function Control({
  onClick,
  role,
  isHost,
  notice,
}: ControlProps) {
  const location = useLocation();
  const { createPollFlag, pollView, handlePollTool, endPoll } = usePollData();
  const roomType = roomStore.state.course.roomType;
  // to get total number of canvas
  const [totalCanvas, setCanvasCount] = useState(1);
  // screen recording
  const [isRecording, setRecording] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportCanvases, setExportCanvases] = useState<ExportCanvasOption[]>([]);
  const [selectedExportCanvasIds, setSelectedExportCanvasIds] = useState<string[]>([]);
  const [exportOrientation, setExportOrientation] = useState<ExportOrientation>('auto');
  const [exportRotation, setExportRotation] = useState<number>(0);
  const [isExporting, setExporting] = useState(false);
  const [historyState, setHistoryState] = useState(getAnnotationHistoryState());
  let recorder = useRef<any>();
  let desktopStream = useRef<any>();
  // to get current canvas number
  const [currentCanvasNumber, setCanvasNumber] = useState(1);
  const isLiveReview = useMemo(() => Boolean(location.pathname.match(/one-to-one/)), [location.pathname]);
  const canManageCanvas = useMemo(() => role === 'teacher' || isLiveReview, [isLiveReview, role]);
  const showCreate: boolean = useMemo(() => {

    if (role === 'teacher' && (location.pathname.match(/big-class/) || location.pathname.match(/small-class/))) {
      return true
    }
    return false;
  }, [location.pathname, role]);

  const fileState = useContext(fileContext);

  useEffect(() => {
    const removeListener = addHistoryStateListener((event: any) => {
      setHistoryState(event.detail || getAnnotationHistoryState());
    });

    setHistoryState(getAnnotationHistoryState());
    return removeListener;
  }, []);

  useEffect(() => {

    if (fileState.pdfFiles.length < totalCanvas) {
      let current = document.getElementsByClassName('pdfViewer active')[0];
      let canvas = current?.id.substring(15);

      if (isNaN(parseInt(canvas!))) {
        const currentCanvasIndex = fileState.pdfFiles.indexOf(canvas)
        setCanvasNumber(currentCanvasIndex + 1);
      } else {
        let currentCanvasIndex = fileState.pdfFiles.indexOf(parseInt(canvas)) + 1;
        setCanvasNumber(currentCanvasIndex)
      }

      // set number of pages for active canvas
      let totalPages = current.childElementCount
      fileState.setTotalPages(totalPages)
    } else {
      setCanvasNumber(fileState.pdfFiles.length)
    }
    setCanvasCount(fileState.pdfFiles.length)
  }, [fileState.pdfFiles.length])


  // active and de-active every canvas div
  const activediv = async (value: string) => {

    // get every canvas div
    const active = document.getElementsByClassName('pdfViewer');

    if (value == 'active') {
      // loop through every canvas and add active class
      for (let i = 0; i < active.length; i++) {
        active[i].classList.add('active');
      }
    } else if (value == 'deactive') {
      // loop through every canvas and remove active class
      for (let i = 0; i < active.length; i++) {
        if (i + 1 == currentCanvasNumber) {
          continue;
        }
        active[i].classList.remove('active');
      }
    }
  }

  const syncAnnotationSnapshot = async (action: 'undo' | 'redo') => {
    const result = action === 'undo' ? await undoAnnotations() : await redoAnnotations();

    if (!result) {
      globalStore.showToast({
        type: 'notice-board',
        message: action === 'undo' ? 'Nothing to undo' : 'Nothing to redo',
      });
      return;
    }

    sendToRemote(
      result.annotations,
      result.documentId,
      'annotation-removed',
      roomStore._state.me.uid
    );
  };

  const openExportDialog = () => {
    const canvases = getExportCanvasOptions();
    setExportCanvases(canvases);
    setSelectedExportCanvasIds(canvases.map((canvas) => canvas.id));
    setExportOrientation('auto');
    setExportRotation(0);
    setExportDialogOpen(true);
  };

  const toggleExportCanvas = (canvasId: string) => {
    setSelectedExportCanvasIds((current) => {
      if (current.includes(canvasId)) {
        return current.filter((id) => id !== canvasId);
      }
      return [...current, canvasId];
    });
  };

  const toggleAllExportCanvases = () => {
    if (selectedExportCanvasIds.length === exportCanvases.length) {
      setSelectedExportCanvasIds([]);
      return;
    }
    setSelectedExportCanvasIds(exportCanvases.map((canvas) => canvas.id));
  };

  // download annotated canvas as a configurable .pdf file
  const printDocument = async () => {
    if (!selectedExportCanvasIds.length) {
      globalStore.showToast({
        type: 'notice-board',
        message: 'Select at least one canvas to export',
      });
      return;
    }

    setExporting(true);
    try {
      await activediv('active');

      const viewers = Array.from(
        document.querySelectorAll('#main-container > .pdfViewer')
      ).filter((viewer) => selectedExportCanvasIds.includes((viewer as HTMLElement).id)) as HTMLElement[];

      if (!viewers.length) {
        globalStore.showToast({
          type: 'notice-board',
          message: 'No selected workspace pages to download',
        });
        return;
      }

      let pdf: any = null;

      for (let i = 0; i < viewers.length; i++) {
        const sourceCanvas = await html2canvas(viewers[i], {
          backgroundColor: '#ffffff',
          useCORS: true,
        });
        const canvas = rotateCanvas(sourceCanvas, exportRotation);
        const pageOrientation = getPdfOrientation(exportOrientation, canvas);

        if (!pdf) {
          pdf = new jsPDF({
            orientation: pageOrientation,
            unit: 'mm',
            format: 'a4',
          });
        } else {
          pdf.addPage('a4', pageOrientation);
        }

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const margin = 10;
        const availableWidth = pageWidth - margin * 2;
        const availableHeight = pageHeight - margin * 2;
        const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
        const imageWidth = canvas.width * scale;
        const imageHeight = canvas.height * scale;
        const x = (pageWidth - imageWidth) / 2;
        const y = (pageHeight - imageHeight) / 2;

        pdf.addImage(imgData, 'JPEG', x, y, imageWidth, imageHeight, undefined, 'FAST');
      }

      const roomName = roomStore._state.course.roomName || 'workspace';
      const fileName = roomName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'workspace';
      pdf.save(`${fileName}-annotated.pdf`);
      setExportDialogOpen(false);
    } catch (err) {
      globalStore.showToast({
        type: 'notice-board',
        message: 'PDF download failed. Please try again.',
      });
    } finally {
      await activediv('deactive');
      setExporting(false);
    }
  }

  const showTool: boolean = useMemo(() => {
    if (role === 'student' && (location.pathname.match(/big-class/) || location.pathname.match(/small-class/))) {
      return true
    }
    return false;
  }, [location.pathname, role]);


  // get random string 
  function getRandomString() {
    if (window.crypto && window.crypto.getRandomValues && navigator.userAgent.indexOf('Safari') === -1) {
      var a = window.crypto.getRandomValues(new Uint32Array(3)),
        token = '';
      for (var i = 0, l = a.length; i < l; i++) {
        token += a[i].toString(36);
      }
      return token;
    } else {
      return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
    }
  }

  // file name for recorded file
  function getFileName(fileExtension: any) {
    var d = new Date();
    var year = d.getFullYear();
    var month = d.getMonth();
    var date = d.getDate();
    return 'RecordRTC-' + year + month + date + '-' + getRandomString() + '.' + fileExtension;
  }


  // stop recording
  const stopRecording = async () => {
    recorder.current.stopRecording(function () {
      setRecording(false);
      let blob = recorder.current.getBlob();
      var file = new File([blob], getFileName('mp4'), {
        type: 'video/mp4'
      });
      // save recording as mp4
      RecordRTCPromisesHandler.invokeSaveAsDialog(file, getFileName('mp4'));
      let tracks = desktopStream.current.getTracks();
      // stop screen recording track
      tracks.forEach((track: any) => track.stop());
      globalStore.showToast({
        type: 'notice-board',
        message: t('toast.stop_recording')
      });
    });
  }


  // record screen 
  const handleScreenRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      let displaymediastreamconstraints = {
        video: {
          displaySurface: 'browser'
        },
        audio: true,
      };

      const mediaDevices = navigator.mediaDevices as any;
       
      try {
        // get screen stream
        desktopStream.current = await mediaDevices.getDisplayMedia(displaymediastreamconstraints);
      const tracks = [
        ...desktopStream.current.getVideoTracks(),
      ];

      let stream = new MediaStream(tracks);
      recorder.current = new RecordRTCPromisesHandler(stream, {
        type: 'video'
      });

      // start recording
      recorder.current.startRecording();
      setRecording(true);

      // stop recording on stop screenshare lisnter
      desktopStream.current.getVideoTracks()[0].onended = function () {
        stopRecording();
      };

      globalStore.showToast({
        type: 'notice-board',
        message: t('toast.start_recording')
      });
      } catch(err) {}
    }
  }


  // allow student to annotate for single classroom
  const allowToAnnotate = async () => {
    try {
      const annotationAllow = roomStore._state.course.allowAnnotation;
    const student = roomStore._state.users;
    let uids: string[] = [];
    student.forEach((x) => {
      console.log(x);
      if (x.role == 'student') {
        uids.push(x.uid);
      }
    });

    if (uids.length === 0) {
      globalStore.showToast({
        message: t('toast.student_not_joined'),
        type: 'notice'
      });
      return;
    }

    // check if student is online
    let uid = await roomStore.rtmClient.queryOnlineStatusById(uids);
    if (uid === undefined) {
      globalStore.showToast({
        message: t('toast.student_not_joined'),
        type: 'notice'
      });
      return;
    }

    // allow or deny to annotate
    if (Boolean(annotationAllow)) {
      await roomStore.mute(uid, 'grantBoard');
      await roomStore.setApplyUid('0');
    } else {
      await roomStore.unmute(uid, 'grantBoard');
      await roomStore.setApplyUid(uid);
    }
    } catch (err) {}
  }

  return (
    <>
      <div className="controls-container">
        <div className="interactive">
          {notice ?
            <ControlItem name={notice.reason}
              onClick={onClick} />
            : null}
        </div>
        {canManageCanvas || showTool ?
          <div className="controls">
            {canManageCanvas ?
              <>
                <div className={`control-button history-control ${historyState.canUndo ? '' : 'disabled'}`}>
                  <UndoIcon onClick={() => historyState.canUndo && syncAnnotationSnapshot('undo')} />
                  <span className="tooltiptext">Undo</span>
                </div>

                <div className={`control-button history-control ${historyState.canRedo ? '' : 'disabled'}`}>
                  <RedoIcon onClick={() => historyState.canRedo && syncAnnotationSnapshot('redo')} />
                  <span className="tooltiptext">Redo</span>
                </div>

                <div className="menu-split" style={{ marginLeft: '7px', marginRight: '7px' }}></div>

                <div className="control-button">
                  <FirstPageIcon onClick={() => toggleFirstLast('first', setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)}>
                  </FirstPageIcon>
                  <span className="tooltiptext">First Canvas</span>
                </div>

                <div className="control-button">
                  <ArrowBackIosIcon onClick={() => togglePrev(setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)} />
                  <span className="tooltiptext">Previous Canvas</span>
                </div>
                <div className="current_page">
                  <span>{currentCanvasNumber}/{totalCanvas}</span>
                </div>
                <div className="control-button">
                  <ArrowForwardIosIcon onClick={() => toggleNext(setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)} />
                  <span className="tooltiptext">Next Canvas</span>
                </div>

                <div className="control-button">
                  <LastPageIcon onClick={() => toggleFirstLast('last', setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)} />
                  <span className="tooltiptext">Last Canvas</span>
                </div>

                <div className="control-button">
                  <AddCircleOutlineIcon id="add_page" onClick={() => fileState.fileDispatch({ type: 'add-page' })} />
                  <span className="tooltiptext">Add Canvas</span>
                </div>
                {
                  fileState.pdfFiles.length > 1 ?
                    <div className="control-button">
                      <RemoveCircleOutlineOutlinedIcon
                        id="remove_page"
                        onClick={
                          () => {
                            if (window.confirm('Are you sure you want to delete canvas?'))
                              fileState.fileDispatch({ type: 'remove-page' })
                          }
                        }
                      />
                      <span className="tooltiptext">Remove Canvas</span>
                    </div> : null
                }
                <div className='control-button'>
                  <GetAppIcon onClick={openExportDialog} />
                  <span className="tooltiptext">Export annotated PDF</span>
                </div>
                <div className="menu-split" style={{ marginLeft: '7px', marginRight: '7px' }}></div>
              </> : null
            }
            {
              role === 'teacher' ?
                (
                  <>
                    {
                      isRecording ?
                        <div className="control-button">
                          <StopIcon onClick={handleScreenRecording} />
                          <span className="tooltiptext">Stop recording</span>
                        </div>
                        :
                        <div className="control-button">
                          <FiberManualRecordIcon onClick={handleScreenRecording} />
                          <span className="tooltiptext">Start recording</span>
                        </div>
                    }
                  </>
                ) : null
            }
            <div className="menu-split" style={{ marginLeft: '7px', marginRight: '7px' }}></div>

            {
              role === 'teacher' && roomType === 0 && !isLiveReview ?
                (
                  <>
                    {
                      !roomStore._state.course.allowAnnotation ?
                        <div className="control-button">
                          <CreateOutlinedIcon onClick={allowToAnnotate} />
                          <span className="tooltiptext">Allow annotation</span>
                        </div> :
                        <div className="control-button">
                          <CreateIcon style={{ color: green[500] }} onClick={allowToAnnotate} />
                          <span className="tooltiptext">Deny annotation</span>
                        </div>
                    }
                  </>
                ) : null
            }
            {role === 'teacher' ?
              showCreate ?
                <>
                  <ControlItem
                    name={pollView === 'create' ? 'poll_create' : 'poll_show'}
                    onClick={() => { pollView === 'create' ? handlePollTool('create_popup', true) : handlePollTool('show_popup', true) }}
                    text={pollView === 'create' ? '' : ''}
                  />
                </> : null
              : null}

            {role === 'student' && !isLiveReview ?
              <>
                <ControlItem
                  name={isHost ? 'hands_up_end' : 'hands_up'}
                  onClick={onClick}
                  text={''}
                />
              </>
              : null}

          </div> : null}
      </div>
      <PollCard
        createFlag={createPollFlag}
        role={role}
        tool={handlePollTool}
        endPoll={endPoll}
      />
      {exportDialogOpen ?
        <div className="export-modal-backdrop" role="presentation">
          <div className="export-modal-panel" role="dialog" aria-modal="true" aria-labelledby="exportPdfTitle">
            <div className="export-modal-header">
              <div>
                <span>Export</span>
                <h2 id="exportPdfTitle">Annotated PDF</h2>
              </div>
              <button type="button" onClick={() => setExportDialogOpen(false)} disabled={isExporting}>Close</button>
            </div>

            <div className="export-modal-section">
              <div className="export-section-title">
                <strong>Canvas pages</strong>
                <button type="button" onClick={toggleAllExportCanvases} disabled={isExporting}>
                  {selectedExportCanvasIds.length === exportCanvases.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="export-canvas-list">
                {exportCanvases.map((canvas) => (
                  <label key={canvas.id} className="export-canvas-row">
                    <input
                      type="checkbox"
                      checked={selectedExportCanvasIds.includes(canvas.id)}
                      disabled={isExporting}
                      onChange={() => toggleExportCanvas(canvas.id)}
                    />
                    <span>
                      <strong>{canvas.label}</strong>
                      <small>{canvas.pageCount} document page{canvas.pageCount === 1 ? '' : 's'}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="export-modal-section">
              <strong>Page direction</strong>
              <div className="export-segmented">
                {(['auto', 'portrait', 'landscape'] as ExportOrientation[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={exportOrientation === option ? 'active' : ''}
                    disabled={isExporting}
                    onClick={() => setExportOrientation(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="export-modal-section">
              <strong>Rotate export</strong>
              <div className="export-rotation-grid">
                {[0, 90, 180, 270].map((rotation) => (
                  <button
                    key={rotation}
                    type="button"
                    className={exportRotation === rotation ? 'active' : ''}
                    disabled={isExporting}
                    onClick={() => setExportRotation(rotation)}
                  >
                    <RotateRightIcon />
                    {rotation}°
                  </button>
                ))}
              </div>
            </div>

            <div className="export-modal-footer">
              <span>{selectedExportCanvasIds.length} selected</span>
              <button
                type="button"
                className="primary"
                disabled={isExporting || !selectedExportCanvasIds.length}
                onClick={printDocument}
              >
                {isExporting ? 'Exporting...' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div> : null}
    </>
  )
};
