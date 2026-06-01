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
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import PeopleIcon from '@material-ui/icons/People';
import ShareIcon from '@material-ui/icons/Share';
import { undoAnnotations, redoAnnotations, getAnnotationHistoryState, addHistoryStateListener } from '../../utils/annotation-history';
import { getWorkspaceId, inviteWorkspaceUser, listWorkspaceMembers, searchUsers, updateWorkspaceMemberStatus } from '../../utils/hexscrum-api';


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

type ExportPreviewItem = ExportCanvasOption & {
  imageUrl: string
}

type ExportParticipant = {
  uid: string
  authUserId?: string
  name: string
  role: string
}

type WorkspaceMemberRow = {
  user_id: string
  user_name: string
  user_email: string
  user_designation: string
  role: string
  color: string
  status: string
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

function workspaceCodeFromId(workspaceId: string) {
  return String(workspaceId || '').replace(/^workspace-/, '').toUpperCase() || 'WORKSPACE';
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

function captureCanvasForExport(
  viewer: HTMLElement,
  includeAnnotations: boolean,
  scale: number = 1
) {
  return html2canvas(viewer, {
    backgroundColor: '#ffffff',
    useCORS: true,
    scale,
    onclone: (clonedDocument: Document) => {
      if (includeAnnotations) return;
      const clonedViewer = clonedDocument.getElementById(viewer.id);
      if (!clonedViewer) return;
      clonedViewer
        .querySelectorAll('svg.customAnnotationLayer')
        .forEach((layer: Element) => {
          (layer as HTMLElement).style.display = 'none';
        });
    },
  });
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
  const [exportParticipants, setExportParticipants] = useState<ExportParticipant[]>([]);
  const [selectedExportCanvasIds, setSelectedExportCanvasIds] = useState<string[]>([]);
  const [exportOrientation, setExportOrientation] = useState<ExportOrientation>('auto');
  const [exportRotation, setExportRotation] = useState<number>(0);
  const [exportIncludeAnnotations, setExportIncludeAnnotations] = useState(true);
  const [exportPreviewItems, setExportPreviewItems] = useState<ExportPreviewItem[]>([]);
  const [isGeneratingPreview, setGeneratingPreview] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [historyState, setHistoryState] = useState(getAnnotationHistoryState());
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [participantPanelOpen, setParticipantPanelOpen] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareSearch, setShareSearch] = useState('');
  const [shareUsers, setShareUsers] = useState<any[]>([]);
  const [shareLink, setShareLink] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  let recorder = useRef<any>();
  let desktopStream = useRef<any>();
  const previewRequestId = useRef(0);
  // to get current canvas number
  const [currentCanvasNumber, setCanvasNumber] = useState(1);
  const isLiveReview = useMemo(() => Boolean(location.pathname.match(/one-to-one/)), [location.pathname]);
  const showCreate: boolean = useMemo(() => {

    if (role === 'teacher' && (location.pathname.match(/big-class/) || location.pathname.match(/small-class/))) {
      return true
    }
    return false;
  }, [location.pathname, role]);

  const fileState = useContext(fileContext);
  const canAnnotate = fileState.canAnnotate !== false;
  const canManageWorkspace = Boolean(fileState.canManageWorkspace || role === 'teacher');
  const canManageCanvas = canManageWorkspace;
  const canExportWorkspace = canAnnotate || canManageWorkspace;

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
    const me = roomStore._state.me || {};
    const participantMap: { [key: string]: ExportParticipant } = {};
    if (me.uid || me.account || role) {
      participantMap[String(me.uid || 'me')] = {
        uid: String(me.uid || 'me'),
        name: me.account || 'Current user',
        role: me.role === 'teacher' || role === 'teacher' ? 'Lead reviewer' : 'Reviewer',
      };
    }
    roomStore._state.users
      .toArray()
      .forEach((user: any, index: number) => {
        const uid = String(user.uid || `participant-${index}`);
        participantMap[uid] = {
          uid,
          authUserId: user.authUserId,
          name: user.account || (uid === String(me.uid) ? me.account : '') || 'Unknown',
          role: user.role === 'teacher' ? 'Lead reviewer' : 'Reviewer',
        };
      });
    setExportCanvases(canvases);
    setExportParticipants(Object.values(participantMap));
    setSelectedExportCanvasIds(canvases.map((canvas) => canvas.id));
    setExportOrientation('auto');
    setExportRotation(0);
    setExportIncludeAnnotations(true);
    setExportPreviewItems([]);
    setExportDialogOpen(true);
  };

  const refreshExportPreview = async () => {
    if (!exportDialogOpen) return;
    if (!selectedExportCanvasIds.length) {
      setExportPreviewItems([]);
      return;
    }

    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setGeneratingPreview(true);
    try {
      await activediv('active');
      const viewers = Array.from(
        document.querySelectorAll('#main-container > .pdfViewer')
      ).filter((viewer) => selectedExportCanvasIds.includes((viewer as HTMLElement).id)) as HTMLElement[];

      const nextPreviewItems: ExportPreviewItem[] = [];
      for (const viewer of viewers) {
        const canvasMeta = exportCanvases.find((item) => item.id === viewer.id);
        const previewCanvas = await captureCanvasForExport(viewer, exportIncludeAnnotations, 0.28);
        if (previewRequestId.current !== requestId) return;
        nextPreviewItems.push({
          id: viewer.id,
          label: canvasMeta ? canvasMeta.label : viewer.id.replace('viewerContainer', 'Canvas '),
          pageCount: canvasMeta ? canvasMeta.pageCount : viewer.querySelectorAll('.page').length || 1,
          imageUrl: previewCanvas.toDataURL('image/jpeg', 0.72),
        });
      }
      if (previewRequestId.current === requestId) {
        setExportPreviewItems(nextPreviewItems);
      }
    } catch (err) {
      if (previewRequestId.current === requestId) {
        setExportPreviewItems([]);
      }
    } finally {
      await activediv('deactive');
      if (previewRequestId.current === requestId) {
        setGeneratingPreview(false);
      }
    }
  };

  useEffect(() => {
    if (!exportDialogOpen) return;
    refreshExportPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportDialogOpen, selectedExportCanvasIds, exportIncludeAnnotations]);

  const currentWorkspaceId = () => getWorkspaceId() || roomStore._state.course.rid || '';

  const currentWorkspaceInviteLink = () => {
    const workspaceId = currentWorkspaceId();
    return workspaceId ? `${window.location.origin}/?join=${encodeURIComponent(workspaceId)}` : '';
  };

  const loadParticipants = () => {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !canManageWorkspace) return;
    listWorkspaceMembers(workspaceId)
      .then((data: any) => setWorkspaceMembers(data.members || []))
      .catch((err: any) => {
        globalStore.showToast({
          type: 'notice-board',
          message: err.message || 'Unable to load participants',
        });
      });
  };

  const toggleParticipantPanel = () => {
    const next = !participantPanelOpen;
    setParticipantPanelOpen(next);
    if (next) setSharePanelOpen(false);
    if (next) loadParticipants();
  };

  const openSharePanel = () => {
    setSharePanelOpen(true);
    setParticipantPanelOpen(false);
    setShareStatus('');
    setShareLink(currentWorkspaceInviteLink());
  };

  const handleShareUserSearch = () => {
    if (!shareSearch.trim()) {
      setShareUsers([]);
      return;
    }
    searchUsers(shareSearch.trim())
      .then((data: any) => setShareUsers(data.users || []))
      .catch((err: any) => setShareStatus(err.message || 'Unable to search users'));
  };

  const handleInviteReviewer = async () => {
    const workspaceId = currentWorkspaceId();
    const email = shareEmail.trim();
    if (!workspaceId || !email) return;

    try {
      await inviteWorkspaceUser(workspaceId, {
        email,
        role: 'reviewer',
      });
      setShareStatus('Invite created. Share this link only with the invited reviewer.');
      setShareEmail('');
      setShareUsers([]);
      setShareLink(currentWorkspaceInviteLink());
      loadParticipants();
    } catch (err) {
      setShareStatus(err.message || 'Unable to create invite');
    }
  };

  const copyInRoomShareLink = async () => {
    const link = shareLink || currentWorkspaceInviteLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setShareStatus('Invite link copied.');
    } catch (err) {
      setShareStatus('Copy failed. Select and copy the link manually.');
    }
  };

  const activeParticipants = () => {
    const me = roomStore._state.me || {};
    const participantMap: { [key: string]: any } = {};
    if (me.uid) participantMap[String(me.uid)] = me;
    roomStore._state.users.toArray().forEach((user: any) => {
      if (user.uid) participantMap[String(user.uid)] = user;
    });
    return Object.values(participantMap).filter((user: any) => user.uid);
  };

  const memberForParticipant = (participant: any) => {
    if (!participant.authUserId) return null;
    return workspaceMembers.find((member) => member.user_id === participant.authUserId) || null;
  };

  const updateParticipantStatus = async (participant: any, status: 'active' | 'kicked' | 'blocked') => {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !participant.authUserId) {
      globalStore.showToast({
        type: 'notice-board',
        message: 'Participant identity is not available yet.',
      });
      return;
    }

    try {
      await updateWorkspaceMemberStatus(workspaceId, participant.authUserId, status);
      if (status !== 'active') {
        await roomStore.rtmClient.sendChannelMessage(JSON.stringify({
          type: 'participant-status',
          workspaceId,
          targetUid: participant.uid,
          targetAuthUserId: participant.authUserId,
          status,
          message: status === 'blocked'
            ? 'The lead reviewer blocked your access to this workspace.'
            : 'The lead reviewer removed you from this workspace.',
        }));
      }
      loadParticipants();
      globalStore.showToast({
        type: 'notice-board',
        message: `${participant.account || 'Reviewer'} marked as ${status}.`,
      });
    } catch (err) {
      globalStore.showToast({
        type: 'notice-board',
        message: err.message || 'Unable to update participant status',
      });
    }
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
        const sourceCanvas = await captureCanvasForExport(viewers[i], exportIncludeAnnotations);
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
      pdf.save(`${fileName}-${exportIncludeAnnotations ? 'annotated' : 'clean'}.pdf`);
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
        <button
          type="button"
          className={`control-collapse-toggle ${controlsCollapsed ? 'collapsed' : ''}`}
          onClick={() => setControlsCollapsed(!controlsCollapsed)}
          aria-label={controlsCollapsed ? 'Open bottom toolbar' : 'Close bottom toolbar'}
        >
          {controlsCollapsed ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </button>
        {canAnnotate || canManageCanvas || showTool ?
          <div className={`controls ${controlsCollapsed ? 'is-collapsed' : ''}`}>
            {canAnnotate ?
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
              </> : null
            }
            {canManageCanvas ?
              <>
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
                <div className="menu-split" style={{ marginLeft: '7px', marginRight: '7px' }}></div>
              </> : null
            }
            {canExportWorkspace ?
              <div className='control-button'>
                <GetAppIcon onClick={openExportDialog} />
                <span className="tooltiptext">Export annotated PDF</span>
              </div> : null}
            {canManageWorkspace ?
              <div className='control-button'>
                <PeopleIcon onClick={toggleParticipantPanel} />
                <span className="tooltiptext">Participants</span>
              </div> : null}
            {canManageWorkspace ?
              <div className='control-button'>
                <ShareIcon onClick={openSharePanel} />
                <span className="tooltiptext">Share workspace</span>
              </div> : null}
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
        {sharePanelOpen && canManageWorkspace ?
          <div className="share-control-panel">
            <div className="participant-control-header">
              <div>
                <span>Share</span>
                <strong>Invite reviewer</strong>
              </div>
              <button onClick={() => setSharePanelOpen(false)}>Close</button>
            </div>
            <div className="share-control-code">
              <span>Workspace code</span>
              <strong>{workspaceCodeFromId(currentWorkspaceId())}</strong>
              <small>{roomStore._state.course.roomName || 'Live workspace'}</small>
            </div>
            <label className="share-control-field">
              Reviewer email
              <input
                value={shareEmail}
                onChange={(evt: any) => setShareEmail(evt.target.value)}
                placeholder="reviewer@example.com"
              />
            </label>
            <div className="share-control-actions">
              <button disabled={!shareEmail.trim()} onClick={handleInviteReviewer}>Send invite</button>
              <button onClick={copyInRoomShareLink}>Copy link</button>
            </div>
            <div className="share-control-search">
              <label className="share-control-field">
                Search users
                <input
                  value={shareSearch}
                  onChange={(evt: any) => setShareSearch(evt.target.value)}
                  placeholder="Name or email"
                />
              </label>
              <button onClick={handleShareUserSearch}>Search</button>
            </div>
            {shareUsers.length ?
              <div className="share-user-results">
                {shareUsers.map((user: any) => (
                  <button key={user.id} onClick={() => setShareEmail(user.email)}>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </button>
                ))}
              </div> : null}
            {shareLink ?
              <div className="share-link-display">
                <span>Restricted join link</span>
                <input value={shareLink} readOnly />
              </div> : null}
            {shareStatus ? <p className="share-control-status">{shareStatus}</p> : null}
          </div> : null}
        {participantPanelOpen && canManageWorkspace ?
          <div className="participant-control-panel">
            <div className="participant-control-header">
              <div>
                <span>Lead controls</span>
                <strong>Participants</strong>
              </div>
              <button onClick={() => setParticipantPanelOpen(false)}>Close</button>
            </div>
            <div className="participant-control-list">
              {activeParticipants().map((participant: any) => {
                const linkedMember = memberForParticipant(participant);
                const isSelf = String(participant.uid) === String(roomStore._state.me.uid);
                return (
                  <div key={participant.uid} className="participant-control-row">
                    <div>
                      <strong>{participant.account || participant.uid}</strong>
                      <span>{participant.role === 'teacher' ? 'Lead reviewer' : 'Reviewer'} · {linkedMember ? linkedMember.status : 'live'}</span>
                    </div>
                    {isSelf || participant.role === 'teacher' ? <small>{isSelf ? 'You' : 'Lead'}</small> : (
                      <div className="participant-control-actions">
                        {linkedMember && linkedMember.status !== 'active' ? <button onClick={() => updateParticipantStatus(participant, 'active')}>Admit</button> : null}
                        <button onClick={() => updateParticipantStatus(participant, 'kicked')}>Kick</button>
                        <button onClick={() => updateParticipantStatus(participant, 'blocked')}>Block</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
              <strong>Annotation layer</strong>
              <div className="export-segmented export-annotation-toggle">
                <button
                  type="button"
                  className={exportIncludeAnnotations ? 'active' : ''}
                  disabled={isExporting}
                  onClick={() => setExportIncludeAnnotations(true)}
                >
                  With annotations
                </button>
                <button
                  type="button"
                  className={!exportIncludeAnnotations ? 'active' : ''}
                  disabled={isExporting}
                  onClick={() => setExportIncludeAnnotations(false)}
                >
                  Document only
                </button>
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

            <div className="export-modal-section export-preview-section">
              <strong>Preview</strong>
              <div className="export-thumbnail-strip">
                {isGeneratingPreview ?
                  <div className="export-preview-loading">Generating preview...</div> :
                  exportPreviewItems.length ?
                    exportPreviewItems.map((preview) => (
                      <figure key={preview.id} className="export-thumbnail-card">
                        <img src={preview.imageUrl} alt={`${preview.label} export preview`} />
                        <figcaption>
                          <strong>{preview.label}</strong>
                          <span>{preview.pageCount} page{preview.pageCount === 1 ? '' : 's'} · {exportIncludeAnnotations ? 'with annotations' : 'document only'}</span>
                        </figcaption>
                      </figure>
                    )) :
                    <div className="export-preview-loading">Select a canvas to preview.</div>
                }
              </div>
              <div className="export-preview-card">
                <div>
                  <span>Canvases</span>
                  <strong>{selectedExportCanvasIds.length}/{exportCanvases.length}</strong>
                </div>
                <div>
                  <span>Direction</span>
                  <strong>{exportOrientation}</strong>
                </div>
                <div>
                  <span>Rotation</span>
                  <strong>{exportRotation}°</strong>
                </div>
                <div>
                  <span>Annotations</span>
                  <strong>{exportIncludeAnnotations ? 'included' : 'hidden'}</strong>
                </div>
              </div>
              <div className="export-participants">
                <span>Participants</span>
                {exportParticipants.length ?
                  exportParticipants.map((participant) => (
                    <div key={participant.uid || participant.name}>
                      <strong>{participant.name}</strong>
                      <small>{participant.role}</small>
                    </div>
                  )) :
                  <div>
                    <strong>No active participants found</strong>
                    <small>Only the lead reviewer is currently visible.</small>
                  </div>
                }
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
