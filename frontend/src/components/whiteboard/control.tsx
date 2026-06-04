import React, { useMemo, useContext, useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
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
import RotateLeftIcon from '@material-ui/icons/RotateLeft';
import ZoomInIcon from '@material-ui/icons/ZoomIn';
import ZoomOutIcon from '@material-ui/icons/ZoomOut';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import PeopleIcon from '@material-ui/icons/People';
import ShareIcon from '@material-ui/icons/Share';
import SlideshowIcon from '@material-ui/icons/Slideshow';
import FullscreenExitIcon from '@material-ui/icons/FullscreenExit';
import { undoAnnotations, redoAnnotations, getAnnotationHistoryState, addHistoryStateListener } from '../../utils/annotation-history';
import { getHexscrumProfile, getWorkspaceId, getWorkspacePresence, inviteWorkspaceUser, listWorkspaceMembers, searchUsers, updateWorkspaceMemberStatus, workspaceJoinLink } from '../../utils/hexscrum-api';


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
  isPresentationMode?: boolean
  role: string
  notice?: NoticeProps
  onClick: (evt: any, type: string) => void
  onPresentationModeChange?: (enabled: boolean) => void
}

type ExportOrientation = 'auto' | 'portrait' | 'landscape';
type ExportCanvasKind = 'pdf-page' | 'spreadsheet';

type ExportCanvasOption = {
  id: string
  label: string
  viewerId: string
  pageNumber: number
  pageCount: number
  width: number
  height: number
  kind: ExportCanvasKind
  documentId?: string
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

type RemoveCanvasTarget = {
  kind: 'canvas' | 'document' | 'spreadsheet'
  title: string
  description: string
}

function syncPresentationPageAfterCanvasChange(pageNumber: number = 1) {
  const pageSync = (window as any).__hexscrumSetPresentationPage;
  if (!document.body.classList.contains('hexscrum-presentation-active') || typeof pageSync !== 'function') {
    return;
  }

  window.setTimeout(() => pageSync(pageNumber), 80);
}

function resetBoardScrollAfterCanvasChange() {
  const board = document.getElementById('Board') as HTMLElement | null;
  if (!board) return;
  (window as any).__hexscrumApplyingRemoteScroll = true;
  board.scrollTop = 0;
  board.scrollLeft = 0;
  window.setTimeout(() => {
    (window as any).__hexscrumApplyingRemoteScroll = false;
  }, 120);
  window.requestAnimationFrame(() => {
    if (typeof (window as any).__hexscrumUpdateBoardScale === 'function') {
      (window as any).__hexscrumUpdateBoardScale();
    }
  });
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
    resetBoardScrollAfterCanvasChange();
    syncPresentationPageAfterCanvasChange(1);
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
    resetBoardScrollAfterCanvasChange();
    syncPresentationPageAfterCanvasChange(1);

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
  const targetViewer = document.querySelector(`.pdfViewer:${item}-child`)!;
  targetViewer.classList.add('active');
  let targetTotalPages = targetViewer.childElementCount || 1;

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
      targetTotalPages = totalPages || targetTotalPages;
      setTotalPages(totalPages)
    }
  }
  resetBoardScrollAfterCanvasChange();
  syncPresentationPageAfterCanvasChange(item === 'last' ? targetTotalPages : 1);
}

function getExportCanvasOptions(): ExportCanvasOption[] {
  const viewers = Array.from(
    document.querySelectorAll('#main-container > .pdfViewer')
  ) as HTMLElement[];

  return viewers.flatMap((viewer, viewerIndex) => {
    const spreadsheetCanvas = viewer.querySelector('.spreadsheet-review-canvas') as HTMLElement | null;
    if (spreadsheetCanvas) {
      const stage = spreadsheetCanvas.querySelector('.spreadsheet-grid-stage') as HTMLElement | null;
      const table = spreadsheetCanvas.querySelector('.spreadsheet-grid') as HTMLElement | null;
      const title = spreadsheetCanvas
        .querySelector('.spreadsheet-review-toolbar strong')
        ?.textContent
        ?.trim();
      const width = Math.ceil(Math.max(
        stage?.scrollWidth || 0,
        stage?.offsetWidth || 0,
        table?.scrollWidth || 0,
        spreadsheetCanvas.clientWidth || 0,
        1
      ));
      const height = Math.ceil(Math.max(
        stage?.scrollHeight || 0,
        stage?.offsetHeight || 0,
        table?.scrollHeight || 0,
        spreadsheetCanvas.clientHeight || 0,
        1
      ));

      return [{
        id: `${viewer.id}__spreadsheet`,
        viewerId: viewer.id,
        label: title || `Spreadsheet ${viewerIndex + 1}`,
        pageNumber: 1,
        pageCount: 1,
        width,
        height,
        kind: 'spreadsheet' as ExportCanvasKind,
        documentId: spreadsheetCanvas.getAttribute('data-document-id') || undefined,
      }];
    }

    const pages = Array.from(viewer.querySelectorAll('.page')) as HTMLElement[];
    const totalPages = pages.length || 1;
    return pages.map((page, pageIndex) => {
      const pageNumber = Number(page.getAttribute('data-page-number')) || pageIndex + 1;
      const width = Number(page.getAttribute('data-pdf-width')) || page.offsetWidth || page.clientWidth || 1;
      const height = Number(page.getAttribute('data-pdf-height')) || page.offsetHeight || page.clientHeight || 1;
      return {
        id: `${viewer.id}__page-${pageNumber}`,
        viewerId: viewer.id,
        label: `Document ${viewerIndex + 1} · Page ${pageNumber}`,
        pageNumber,
        pageCount: totalPages,
        width,
        height,
        kind: 'pdf-page' as ExportCanvasKind,
      };
    });
  });
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

function getPdfPageSize(
  requestedOrientation: ExportOrientation,
  canvas: HTMLCanvasElement
) {
  let width = canvas.width;
  let height = canvas.height;

  if (requestedOrientation === 'portrait' && width > height) {
    return [height, width];
  }

  if (requestedOrientation === 'landscape' && height > width) {
    return [height, width];
  }

  return [width, height];
}

function fitImageInsidePage(canvas: HTMLCanvasElement, pageWidth: number, pageHeight: number) {
  const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;

  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

function captureCanvasForExport(
  page: HTMLElement,
  includeAnnotations: boolean,
  scale: number = 1
) {
  const viewer = page.closest('.pdfViewer') as HTMLElement | null;
  const pageNumber = page.getAttribute('data-page-number') || '';
  return html2canvas(page, {
    backgroundColor: '#ffffff',
    useCORS: true,
    scale,
    onclone: (clonedDocument: Document) => {
      const clonedViewer = viewer ? clonedDocument.getElementById(viewer.id) : null;
      const clonedPage = clonedViewer
        ? clonedViewer.querySelector(`.page[data-page-number="${pageNumber}"]`) as HTMLElement | null
        : null;

      if (!clonedPage) return;

      clonedPage.style.zoom = '1';
      clonedPage.style.transform = 'none';
      clonedPage.style.margin = '0';
      clonedPage.style.boxShadow = 'none';
      clonedPage.style.borderRadius = '0';
      clonedPage.style.overflow = 'hidden';

      const sourceWidth = Number(page.getAttribute('data-pdf-width')) || page.offsetWidth || page.clientWidth;
      const sourceHeight = Number(page.getAttribute('data-pdf-height')) || page.offsetHeight || page.clientHeight;
      if (sourceWidth > 0) clonedPage.style.width = `${sourceWidth}px`;
      if (sourceHeight > 0) clonedPage.style.height = `${sourceHeight}px`;

      if (!includeAnnotations) {
        clonedPage
          .querySelectorAll('svg.customAnnotationLayer')
          .forEach((layer: Element) => {
            (layer as HTMLElement).style.display = 'none';
          });
      }
    },
  });
}

function escapeExportText(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function colorOrFallback(value: string, fallback: string) {
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return fallback;
  return value;
}

function drawSpreadsheetText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  isHeader: boolean
) {
  const value = escapeExportText(text);
  if (!value) return;

  context.save();
  context.beginPath();
  context.rect(x + 2, y + 1, Math.max(width - 4, 1), Math.max(height - 2, 1));
  context.clip();
  context.fillStyle = color;
  context.font = isHeader ? '700 12px Arial, sans-serif' : '12px Arial, sans-serif';
  context.textBaseline = 'middle';
  context.textAlign = isHeader ? 'center' : 'left';
  context.fillText(
    value,
    isHeader ? x + width / 2 : x + 6,
    y + height / 2,
    Math.max(width - 10, 1)
  );
  context.restore();
}

function drawSpreadsheetCell(
  context: CanvasRenderingContext2D,
  cell: HTMLElement,
  table: HTMLElement,
  isHeader: boolean
) {
  const computed = window.getComputedStyle(cell);
  const x = cell.offsetLeft - table.offsetLeft;
  const y = cell.offsetTop - table.offsetTop;
  const width = cell.offsetWidth || Number(computed.width.replace('px', '')) || 1;
  const height = cell.offsetHeight || Number(computed.height.replace('px', '')) || 1;
  const input = cell.querySelector('input') as HTMLInputElement | null;
  const text = input ? (input.value || input.getAttribute('value') || '') : (cell.textContent || '');
  const background = colorOrFallback(computed.backgroundColor, isHeader ? '#403d39' : '#fffcf2');
  const color = colorOrFallback(input?.style.color || computed.color, isHeader ? '#fffcf2' : '#252422');

  context.fillStyle = background;
  context.fillRect(x, y, width, height);
  context.strokeStyle = isHeader ? 'rgba(255, 252, 242, 0.22)' : 'rgba(64, 61, 57, 0.22)';
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, Math.max(width - 1, 1), Math.max(height - 1, 1));
  drawSpreadsheetText(context, text, x, y, width, height, color, isHeader);
}

function drawSpreadsheetOverlay(
  context: CanvasRenderingContext2D,
  stage: HTMLElement,
  width: number,
  height: number
) {
  const overlay = stage.querySelector('.spreadsheet-overlay-layer') as SVGSVGElement | null;
  if (!overlay) return Promise.resolve();

  const clonedOverlay = overlay.cloneNode(true) as SVGSVGElement;
  clonedOverlay.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clonedOverlay.setAttribute('width', String(width));
  clonedOverlay.setAttribute('height', String(height));
  clonedOverlay.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const serialized = new XMLSerializer().serializeToString(clonedOverlay);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;

  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, width, height);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = url;
  });
}

async function captureSpreadsheetForExport(
  stage: HTMLElement,
  option: ExportCanvasOption,
  includeAnnotations: boolean,
  scale: number = 1
) {
  const table = stage.querySelector('.spreadsheet-grid') as HTMLElement | null;
  const width = Math.ceil(Math.max(option.width, stage.scrollWidth, stage.offsetWidth, table?.scrollWidth || 0, 1));
  const height = Math.ceil(Math.max(option.height, stage.scrollHeight, stage.offsetHeight, table?.scrollHeight || 0, 1));
  const maxPixels = scale < 1 ? 3200000 : 16000000;
  const boundedScale = Math.min(scale, Math.sqrt(maxPixels / Math.max(width * height, 1)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * boundedScale));
  canvas.height = Math.max(1, Math.ceil(height * boundedScale));

  const context = canvas.getContext('2d');
  if (!context || !table) return canvas;

  context.scale(boundedScale, boundedScale);
  context.fillStyle = '#fffcf2';
  context.fillRect(0, 0, width, height);

  Array.from(table.querySelectorAll('th, td')).forEach((cell) => {
    drawSpreadsheetCell(context, cell as HTMLElement, table, cell.tagName.toLowerCase() === 'th');
  });

  if (includeAnnotations) {
    await drawSpreadsheetOverlay(context, stage, width, height);
  }

  return canvas;
}

function captureExportElement(
  element: HTMLElement,
  option: ExportCanvasOption,
  includeAnnotations: boolean,
  scale: number = 1
) {
  if (option.kind === 'spreadsheet') {
    return captureSpreadsheetForExport(element, option, includeAnnotations, scale);
  }
  return captureCanvasForExport(element, includeAnnotations, scale);
}

function getExportElement(option: ExportCanvasOption) {
  const viewer = document.getElementById(option.viewerId);
  if (!viewer) return null;
  if (option.kind === 'spreadsheet') {
    return viewer.querySelector('.spreadsheet-review-canvas .spreadsheet-grid-stage') as HTMLElement | null;
  }
  return viewer.querySelector(`.page[data-page-number="${option.pageNumber}"]`) as HTMLElement | null;
}

function isTextEntryTarget(target: EventTarget | null) {
  const node = target as HTMLElement | null;
  if (!node) return false;
  const tagName = (node.tagName || '').toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || node.isContentEditable;
}

function getActiveRemoveTarget(): RemoveCanvasTarget {
  const activeViewer = document.querySelector('.pdfViewer.active') as HTMLElement | null;
  if (!activeViewer) {
    return {
      kind: 'canvas',
      title: 'Delete canvas',
      description: 'This removes the active canvas from the live board.',
    };
  }

  const activeId = activeViewer.id.replace('viewerContainer', '');
  const isUploadedDocument = Number.isNaN(Number(activeId));
  const spreadsheetTitle = activeViewer
    .querySelector('.spreadsheet-review-toolbar strong')
    ?.textContent
    ?.trim();

  if (activeViewer.querySelector('.spreadsheet-review-canvas')) {
    return {
      kind: 'spreadsheet',
      title: 'Delete spreadsheet from board',
      description: `This removes ${spreadsheetTitle || 'this spreadsheet'} from the live board. Workspace history remains available.`,
    };
  }

  if (isUploadedDocument) {
    return {
      kind: 'document',
      title: 'Delete document from board',
      description: 'This removes the uploaded document from the live board for everyone. Workspace history remains available.',
    };
  }

  return {
    kind: 'canvas',
    title: 'Delete canvas',
    description: 'This removes the active blank canvas and its annotations from the live board for everyone.',
  };
}

function activeViewerHasSpreadsheet() {
  return Boolean(document.querySelector('.pdfViewer.active .spreadsheet-review-canvas'));
}

export default function Control({
  onClick,
  role,
  isHost,
  isPresentationMode,
  onPresentationModeChange,
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
  const [workspacePresence, setWorkspacePresence] = useState<any[]>([]);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [selectedShareUser, setSelectedShareUser] = useState<any>(null);
  const [shareSearch, setShareSearch] = useState('');
  const [shareUsers, setShareUsers] = useState<any[]>([]);
  const [shareLink, setShareLink] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [participantStatus, setParticipantStatus] = useState('');
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [removeCanvasTarget, setRemoveCanvasTarget] = useState<RemoveCanvasTarget | null>(null);
  let recorder = useRef<any>();
  let desktopStream = useRef<any>();
  const previewRequestId = useRef(0);
  const participantRequestInFlight = useRef(false);
  const liveViewerZoomRef = useRef(1);
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
  const presentationMode = Boolean(isPresentationMode || fileState.isPresentationMode);
  const viewerZoom = Math.min(2.75, Math.max(0.5, Number(fileState.viewerZoom) || 1));
  const viewerRotation = ((Number(fileState.viewerRotation) || 0) % 360 + 360) % 360;
  const modalRoot = typeof document !== 'undefined' ? document.body : null;

  const refreshBoardScale = (zoomOverride?: number) => {
    if (typeof (window as any).__hexscrumUpdateBoardScale === 'function') {
      (window as any).__hexscrumUpdateBoardScale(zoomOverride);
    }
  };

  useEffect(() => {
    liveViewerZoomRef.current = viewerZoom;
  }, [viewerZoom]);

  const setLiveViewerZoom = (nextZoom: number | ((currentZoom: number) => number)) => {
    const currentZoom = Math.min(2.75, Math.max(0.5, Number(liveViewerZoomRef.current || viewerZoom) || 1));
    const requestedZoom = typeof nextZoom === 'function' ? nextZoom(currentZoom) : nextZoom;
    const roundedZoom = Math.round(Math.min(2.75, Math.max(0.5, requestedZoom)) * 100) / 100;
    liveViewerZoomRef.current = roundedZoom;
    const activeSpreadsheetFrame = document.querySelector('.pdfViewer.active .spreadsheet-review-frame') as HTMLElement | null;
    if (activeSpreadsheetFrame) {
      activeSpreadsheetFrame.style.setProperty('--spreadsheet-viewer-zoom', String(roundedZoom));
    }
    if (typeof fileState.setViewerZoom === 'function') {
      fileState.setViewerZoom(roundedZoom);
    }
    refreshBoardScale(roundedZoom);
  };

  const setLiveViewerRotation = (nextRotation: number) => {
    const normalizedRotation = ((nextRotation % 360) + 360) % 360;
    if (typeof fileState.setViewerRotation === 'function') {
      fileState.setViewerRotation(normalizedRotation);
    }
    if (activeViewerHasSpreadsheet()) {
      window.setTimeout(refreshBoardScale, 160);
      return;
    }
    const rotateActivePdf = (window as any).__hexscrumRotateActivePdfView;
    if (typeof rotateActivePdf === 'function') {
      const didRotate = rotateActivePdf(normalizedRotation);
      if (!didRotate) {
        globalStore.showToast({
          type: 'notice-board',
          message: 'Rotate view is available after uploading a document.',
        });
      }
    }
    window.setTimeout(refreshBoardScale, 160);
  };

  const openRemoveCanvasDialog = () => {
    setRemoveCanvasTarget(getActiveRemoveTarget());
  };

  const confirmRemoveCanvas = () => {
    fileState.fileDispatch({ type: 'remove-page' });
    setRemoveCanvasTarget(null);
  };

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

  const requestPresentationFullscreen = (enabled: boolean) => {
    const board = document.getElementById('Board') as any;
    const documentRef = document as any;

    if (enabled && board && !document.fullscreenElement) {
      const request =
        board.requestFullscreen ||
        board.webkitRequestFullscreen ||
        board.mozRequestFullScreen ||
        board.msRequestFullscreen;
      if (request) {
        const result = request.call(board);
        result && result.catch && result.catch(() => {});
      }
      return;
    }

    if (!enabled && document.fullscreenElement === board) {
      const exit =
        documentRef.exitFullscreen ||
        documentRef.webkitExitFullscreen ||
        documentRef.mozCancelFullScreen ||
        documentRef.msExitFullscreen;
      exit && exit.call(documentRef);
    }
  };

  const setPresentationMode = (enabled: boolean, shouldBroadcast: boolean = true) => {
    onPresentationModeChange && onPresentationModeChange(enabled);
    if (typeof fileState.setPresentationMode === 'function') {
      fileState.setPresentationMode(enabled);
    }
    if (typeof (window as any).__hexscrumSetPresentationMode === 'function') {
      (window as any).__hexscrumSetPresentationMode(enabled);
    }
    requestPresentationFullscreen(enabled);
    if (shouldBroadcast) {
      sendToRemote("", "", "presentation-mode", enabled ? "on" : "off");
    }
    globalStore.showToast({
      type: 'notice-board',
      message: enabled ? 'Slideshow started' : 'Slideshow ended',
    });
  };

  const activeViewer = () => document.querySelector('.pdfViewer.active') as HTMLElement | null;

  const activeSlideCount = () => {
    const viewer = activeViewer();
    return viewer ? viewer.querySelectorAll('.page').length || 1 : Number(fileState.totalPage) || 1;
  };

  const setPresentationSlide = (pageNumber: number, shouldBroadcast: boolean = true) => {
    const total = activeSlideCount();
    const nextPage = Math.min(total, Math.max(1, Number(pageNumber) || 1));
    if (typeof (window as any).__hexscrumSetPresentationPage === 'function') {
      (window as any).__hexscrumSetPresentationPage(nextPage);
    } else if (typeof fileState.setCurrentPage === 'function') {
      fileState.setCurrentPage(nextPage);
    }
    if (shouldBroadcast) {
      sendToRemote("", "", "presentation-slide", nextPage);
    }
  };

  const goToNextPresentationSlide = () => {
    const current = Math.max(1, Number(fileState.currentPage) || 1);
    const total = activeSlideCount();
    if (current < total) {
      setPresentationSlide(current + 1);
      return;
    }

    if (currentCanvasNumber < totalCanvas) {
      toggleNext(setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages);
      window.setTimeout(() => setPresentationSlide(1), 60);
    }
  };

  const goToPreviousPresentationSlide = () => {
    const current = Math.max(1, Number(fileState.currentPage) || 1);
    if (current > 1) {
      setPresentationSlide(current - 1);
      return;
    }

    const currentViewer = activeViewer();
    const previousViewer = currentViewer && currentViewer.previousElementSibling as HTMLElement | null;
    if (previousViewer) {
      const previousTotal = previousViewer.querySelectorAll('.page').length || 1;
      togglePrev(setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages);
      window.setTimeout(() => setPresentationSlide(previousTotal), 60);
    }
  };

  const goToFirstPresentationSlide = () => {
    setPresentationSlide(1);
  };

  const goToLastPresentationSlide = () => {
    setPresentationSlide(activeSlideCount());
  };

  useEffect(() => {
    if (!presentationMode) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;

      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        goToNextPresentationSlide();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goToPreviousPresentationSlide();
      } else if (event.key === 'Home') {
        event.preventDefault();
        goToFirstPresentationSlide();
      } else if (event.key === 'End') {
        event.preventDefault();
        goToLastPresentationSlide();
      } else if (event.key === 'Escape' && canManageWorkspace) {
        event.preventDefault();
        setPresentationMode(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationMode, currentCanvasNumber, totalCanvas, fileState.currentPage, fileState.totalPage]);

  const openExportDialog = () => {
    const canvases = getExportCanvasOptions();
    const activeViewerId = (document.querySelector('.pdfViewer.active') as HTMLElement | null)?.id || '';
    const activeCanvasIds = canvases
      .filter((canvas) => canvas.viewerId === activeViewerId)
      .map((canvas) => canvas.id);
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
    setSelectedExportCanvasIds(activeCanvasIds.length ? activeCanvasIds : canvases.map((canvas) => canvas.id));
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
      const nextPreviewItems: ExportPreviewItem[] = [];
      const selectedPages = exportCanvases
        .filter((item) => selectedExportCanvasIds.includes(item.id))
        .slice(0, 8);

      for (const pageMeta of selectedPages) {
        const element = getExportElement(pageMeta);
        if (!element) continue;
        const previewCanvas = await captureExportElement(element, pageMeta, exportIncludeAnnotations, 0.28);
        if (previewRequestId.current !== requestId) return;
        nextPreviewItems.push({
          ...pageMeta,
          pageCount: 1,
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
    return workspaceJoinLink(workspaceId);
  };

  const loadParticipants = () => {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !canManageWorkspace) return;
    if (participantRequestInFlight.current) return;
    participantRequestInFlight.current = true;
    setParticipantsLoading(true);
    Promise.all([
      listWorkspaceMembers(workspaceId),
      getWorkspacePresence(workspaceId),
    ])
      .then(([memberData, presenceData]: any[]) => {
        setWorkspaceMembers(memberData.members || []);
        setWorkspacePresence(presenceData.participants || []);
        setParticipantStatus('Participants updated.');
      })
      .catch((err: any) => {
        setParticipantStatus(err.message || 'Unable to load participants');
        globalStore.showToast({
          type: 'notice-board',
          message: err.message || 'Unable to load participants',
        });
      })
      .finally(() => {
        participantRequestInFlight.current = false;
        setParticipantsLoading(false);
      });
  };

  const toggleParticipantPanel = () => {
    const next = !participantPanelOpen;
    setParticipantPanelOpen(next);
    if (next) setSharePanelOpen(false);
  };

  useEffect(() => {
    if (!participantPanelOpen || !canManageWorkspace) return undefined;
    loadParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantPanelOpen, canManageWorkspace]);

  const openSharePanel = () => {
    setSharePanelOpen(true);
    setParticipantPanelOpen(false);
    setShareStatus('');
    setSelectedShareUser(null);
    setShareLink(currentWorkspaceInviteLink());
  };

  const handleShareUserSearch = () => {
    if (!shareSearch.trim()) {
      setShareUsers([]);
      return;
    }
    setSelectedShareUser(null);
    searchUsers(shareSearch.trim())
      .then((data: any) => setShareUsers(data.users || []))
      .catch((err: any) => setShareStatus(err.message || 'Unable to search users'));
  };

  const handleInviteReviewer = async () => {
    const workspaceId = currentWorkspaceId();
    if (!workspaceId || !selectedShareUser || !selectedShareUser.id) return;

    try {
      await inviteWorkspaceUser(workspaceId, {
        userId: selectedShareUser.id,
        role: 'reviewer',
      });
      setShareStatus(`Invite created for ${selectedShareUser.name || selectedShareUser.email || 'selected reviewer'}.`);
      setSelectedShareUser(null);
      setShareSearch('');
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
    const keyFor = (user: any) => user.authUserId ? `auth:${user.authUserId}` : `uid:${user.uid}`;
    if (me.uid || me.authUserId) participantMap[keyFor(me)] = me;
    roomStore._state.users.toArray().forEach((user: any) => {
      if (user.uid || user.authUserId) participantMap[keyFor(user)] = user;
    });
    workspacePresence.forEach((presence: any) => {
      const lastSeenAt = Date.parse(presence.lastSeenAt || '');
      if (lastSeenAt && Date.now() - lastSeenAt > 25000) return;
      const presenceUser = {
        uid: presence.userId || presence.user_id,
        authUserId: presence.userId || presence.user_id,
        account: presence.name || presence.email || 'Reviewer',
        role: presence.role === 'lead' ? 'teacher' : 'student',
        presenceOnly: true,
        lastSeenAt: presence.lastSeenAt,
      };
      if (!presenceUser.authUserId) return;
      const key = keyFor(presenceUser);
      participantMap[key] = {
        ...presenceUser,
        ...(participantMap[key] || {}),
        lastSeenAt: presence.lastSeenAt,
      };
    });
    workspaceMembers.forEach((member: any) => {
      if (!member.user_id) return;
      const memberUser = {
        uid: member.user_id,
        authUserId: member.user_id,
        account: member.user_name || member.user_email || member.user_id,
        role: member.role === 'lead' ? 'teacher' : 'student',
        memberOnly: true,
      };
      const key = keyFor(memberUser);
      participantMap[key] = {
        ...memberUser,
        ...(participantMap[key] || {}),
      };
    });
    return Object.values(participantMap).filter((user: any) => user.uid);
  };

  const normalizeIdentity = (value: any) => String(value || '').trim().toLowerCase();

  const memberForParticipant = (participant: any) => {
    if (!participant.authUserId) return null;
    return workspaceMembers.find((member) => member.user_id === participant.authUserId) || null;
  };

  const memberForAnyParticipant = (participant: any) => {
    const directMember = memberForParticipant(participant);
    if (directMember) return directMember;
    const account = normalizeIdentity(participant.account);
    if (!account) return null;
    return workspaceMembers.find((member) => {
      return [member.user_name, member.user_email, member.user_id]
        .map(normalizeIdentity)
        .filter(Boolean)
        .includes(account);
    }) || null;
  };

  const updateParticipantStatus = async (participant: any, status: 'active' | 'kicked' | 'blocked') => {
    const workspaceId = currentWorkspaceId();
    const linkedMember = memberForAnyParticipant(participant);
    const targetAuthUserId = (linkedMember && linkedMember.user_id) || participant.authUserId || '';
    if (!workspaceId || !targetAuthUserId) {
      globalStore.showToast({
        type: 'notice-board',
        message: 'Participant identity is not available yet.',
      });
      return;
    }

    try {
      const result: any = await updateWorkspaceMemberStatus(workspaceId, targetAuthUserId, status);
      if (result && result.member) {
        setWorkspaceMembers((current) => current.map((member) => (
          member.user_id === targetAuthUserId ? { ...member, status: result.member.status } : member
        )));
      }
      if (status !== 'active') {
        try {
          await roomStore.rtmClient.sendChannelMessage(JSON.stringify({
            type: 'participant-status',
            workspaceId,
            targetUid: participant.uid,
            targetAuthUserId,
            status,
            message: status === 'blocked'
              ? 'The lead reviewer blocked your access to this workspace.'
              : 'The lead reviewer removed you from this workspace.',
          }));
        } catch (broadcastErr) {
          console.warn('Participant status broadcast failed:', broadcastErr);
        }
      }
      loadParticipants();
      setParticipantStatus(`${participant.account || 'Reviewer'} marked as ${status}.`);
      globalStore.showToast({
        type: 'notice-board',
        message: `${participant.account || 'Reviewer'} marked as ${status}.`,
      });
    } catch (err) {
      setParticipantStatus(err.message || 'Unable to update participant status');
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

      const selectedPages = exportCanvases.filter((page) =>
        selectedExportCanvasIds.includes(page.id)
      );

      if (!selectedPages.length) {
        globalStore.showToast({
          type: 'notice-board',
          message: 'No selected workspace pages to download',
        });
        return;
      }

      let pdf: any = null;

      for (let i = 0; i < selectedPages.length; i++) {
        const exportElement = getExportElement(selectedPages[i]);
        if (!exportElement) continue;

        const sourceCanvas = await captureExportElement(exportElement, selectedPages[i], exportIncludeAnnotations);
        const canvas = rotateCanvas(sourceCanvas, exportRotation);
        const pageOrientation = getPdfOrientation(exportOrientation, canvas);
        const [pageWidth, pageHeight] = getPdfPageSize(exportOrientation, canvas);

        if (!pdf) {
          pdf = new jsPDF({
            orientation: pageOrientation,
            unit: 'pt',
            format: [pageWidth, pageHeight],
          });
        } else {
          pdf.addPage([pageWidth, pageHeight], pageOrientation);
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const placement = fitImageInsidePage(canvas, pageWidth, pageHeight);

        pdf.addImage(
          imgData,
          'JPEG',
          placement.x,
          placement.y,
          placement.width,
          placement.height,
          undefined,
          'FAST'
        );
      }

      if (!pdf) {
        globalStore.showToast({
          type: 'notice-board',
          message: 'No selected workspace pages could be captured',
        });
        return;
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
                  <FirstPageIcon onClick={() => presentationMode
                    ? goToFirstPresentationSlide()
                    : toggleFirstLast('first', setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)}>
                  </FirstPageIcon>
                  <span className="tooltiptext">{presentationMode ? 'First slide' : 'First Canvas'}</span>
                </div>

                <div className="control-button">
                  <ArrowBackIosIcon onClick={() => presentationMode
                    ? goToPreviousPresentationSlide()
                    : togglePrev(setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)} />
                  <span className="tooltiptext">{presentationMode ? 'Previous slide' : 'Previous Canvas'}</span>
                </div>
                <div className="current_page">
                  <span>{presentationMode ? `${fileState.currentPage || 1}/${fileState.totalPage || 1}` : `${currentCanvasNumber}/${totalCanvas}`}</span>
                </div>
                <div className="control-button">
                  <ArrowForwardIosIcon onClick={() => presentationMode
                    ? goToNextPresentationSlide()
                    : toggleNext(setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)} />
                  <span className="tooltiptext">{presentationMode ? 'Next slide' : 'Next Canvas'}</span>
                </div>

                <div className="control-button">
                  <LastPageIcon onClick={() => presentationMode
                    ? goToLastPresentationSlide()
                    : toggleFirstLast('last', setCanvasNumber, fileState.pdfFiles, fileState.setTotalPages)} />
                  <span className="tooltiptext">{presentationMode ? 'Last slide' : 'Last Canvas'}</span>
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
	                        onClick={openRemoveCanvasDialog}
	                      />
                      <span className="tooltiptext">Remove Canvas</span>
                    </div> : null
                }
                <div className="menu-split" style={{ marginLeft: '7px', marginRight: '7px' }}></div>
              </> : null
            }
            {canManageWorkspace ?
              <>
                <div className="control-button">
                  <ZoomOutIcon onClick={() => setLiveViewerZoom((currentZoom) => currentZoom - 0.25)} />
                  <span className="tooltiptext">Zoom out document</span>
                </div>
                <button
                  type="button"
                  className="current_zoom"
                  onClick={() => setLiveViewerZoom(1)}
                  aria-label="Reset document zoom"
                >
                  {Math.round(viewerZoom * 100)}%
                </button>
                <div className="control-button">
                  <ZoomInIcon onClick={() => setLiveViewerZoom((currentZoom) => currentZoom + 0.25)} />
                  <span className="tooltiptext">Zoom in document</span>
                </div>
                <div className="control-button">
                  <RotateLeftIcon onClick={() => setLiveViewerRotation(viewerRotation - 90)} />
                  <span className="tooltiptext">Rotate left</span>
                </div>
                <div className="control-button">
                  <RotateRightIcon onClick={() => setLiveViewerRotation(viewerRotation + 90)} />
                  <span className="tooltiptext">Rotate right</span>
                </div>
                <div className="menu-split" style={{ marginLeft: '7px', marginRight: '7px' }}></div>
              </> : null
            }
            {canExportWorkspace ?
              <div className='control-button'>
                <GetAppIcon onClick={openExportDialog} />
                <span className="tooltiptext">Export annotated PDF</span>
              </div> : null}
            {canManageWorkspace ?
              <div className={`control-button presentation-control ${presentationMode ? 'active' : ''}`}>
                {presentationMode ?
                  <FullscreenExitIcon onClick={() => setPresentationMode(false)} /> :
                  <SlideshowIcon onClick={() => setPresentationMode(true)} />
                }
                <span className="tooltiptext">{presentationMode ? 'Exit slideshow' : 'Present slideshow'}</span>
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
            <div className="share-control-search">
              <label className="share-control-field">
                Search registered users
                <input
                  value={shareSearch}
                  onChange={(evt: any) => setShareSearch(evt.target.value)}
                  placeholder="Name or email"
                />
              </label>
              <button onClick={handleShareUserSearch}>Search</button>
            </div>
            {selectedShareUser ?
              <div className="share-selected-user">
                <div>
                  <span>Selected reviewer</span>
                  <strong>{selectedShareUser.name || selectedShareUser.email}</strong>
                  <small>{selectedShareUser.designation || selectedShareUser.email || 'Registered user'}</small>
                </div>
                <button onClick={() => setSelectedShareUser(null)}>Change</button>
              </div> : null}
            <div className="share-control-actions">
              <button disabled={!selectedShareUser} onClick={handleInviteReviewer}>Send invite</button>
              <button onClick={copyInRoomShareLink}>Copy link</button>
            </div>
            {shareUsers.length ?
              <div className="share-user-results">
                {shareUsers.map((user: any) => (
                  <button
                    key={user.id}
                    className={selectedShareUser && selectedShareUser.id === user.id ? 'active' : ''}
                    onClick={() => setSelectedShareUser(user)}
                  >
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
              <div className="participant-control-header-actions">
                <button onClick={loadParticipants} disabled={participantsLoading}>
                  {participantsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button onClick={() => setParticipantPanelOpen(false)}>Close</button>
              </div>
            </div>
            {participantStatus ? <p className="participant-control-status">{participantStatus}</p> : null}
            <div className="participant-control-list">
              {activeParticipants().length ? activeParticipants().map((participant: any) => {
                const linkedMember = memberForAnyParticipant(participant);
                const profile = getHexscrumProfile();
                const isSelf = String(participant.uid) === String(roomStore._state.me.uid) ||
                  (participant.authUserId && String(participant.authUserId) === String(profile.userId)) ||
                  (linkedMember && String(linkedMember.user_id) === String(profile.userId));
                const participantState = linkedMember
                  ? linkedMember.status
                  : participant.memberOnly
                    ? 'offline'
                    : 'live';
                return (
                  <div key={participant.uid} className="participant-control-row">
                    <div>
                      <strong>{participant.account || participant.uid}</strong>
                      <span>{participant.role === 'teacher' ? 'Lead reviewer' : 'Reviewer'} · {participantState}</span>
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
              }) : <p className="participant-empty-state">No active participants yet.</p>}
            </div>
          </div> : null}
      </div>
	      <PollCard
	        createFlag={createPollFlag}
	        role={role}
	        tool={handlePollTool}
	        endPoll={endPoll}
	      />
	      {removeCanvasTarget ?
	        <div className="canvas-delete-modal-backdrop" role="presentation" onClick={() => setRemoveCanvasTarget(null)}>
	          <div className="canvas-delete-modal-panel" role="dialog" aria-modal="true" aria-labelledby="deleteCanvasTitle" onClick={(event) => event.stopPropagation()}>
	            <span>{removeCanvasTarget.kind === 'canvas' ? 'Live canvas' : removeCanvasTarget.kind === 'spreadsheet' ? 'Spreadsheet' : 'Document'}</span>
	            <h2 id="deleteCanvasTitle">{removeCanvasTarget.title}</h2>
	            <p>{removeCanvasTarget.description}</p>
	            <div className="canvas-delete-modal-actions">
	              <button type="button" onClick={() => setRemoveCanvasTarget(null)}>Cancel</button>
	              <button type="button" className="danger" onClick={confirmRemoveCanvas}>Delete</button>
	            </div>
	          </div>
	        </div> : null}
	      {exportDialogOpen && modalRoot ? ReactDOM.createPortal(
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
                <strong>Document pages</strong>
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
                      <small>
                        {canvas.kind === 'spreadsheet'
                          ? 'Spreadsheet grid'
                          : `Page ${canvas.pageNumber} of ${canvas.pageCount}`}
                      </small>
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
                          <span>{exportIncludeAnnotations ? 'with annotations' : 'document only'}</span>
                        </figcaption>
                      </figure>
                    )) :
                    <div className="export-preview-loading">Select document pages to preview.</div>
                }
              </div>
              <div className="export-preview-card">
                <div>
                  <span>Pages</span>
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
              <span>{selectedExportCanvasIds.length} item{selectedExportCanvasIds.length === 1 ? '' : 's'} selected</span>
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
        </div>,
        modalRoot
      ) : null}
    </>
  )
};
