import PDFJSAnnotate from '../PDFJSAnnotate';
import appendChild from '../render/appendChild';
import {
  BORDER_COLOR,
  disableUserSelect,
  enableUserSelect,
  findSVGAtPoint,
  getMetadata,
  scaleDown
} from './utils';

let _enabled = false;
let overlay;
let originY;
let originX;
let _ellipseColor;
let _ellipseSize;

let isEnablePointerEvents = false;
function checkForPointerEvents() {
  isEnablePointerEvents = true;
  document.removeEventListener('pointermove', checkForPointerEvents);
}

document.addEventListener('pointermove', checkForPointerEvents);

/**
 * Handle document.mousedown event
 *
 * @param {Event} e The DOM event to handle
 */
function handleDocumentMousedown(e) {
  let svg;
  if (!(svg = findSVGAtPoint(e.clientX, e.clientY))) {
    return;
  }

  let rect = svg.getBoundingClientRect();
  originY = e.clientY;
  originX = e.clientX;

  overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = `${originY - rect.top}px`;
  overlay.style.left = `${originX - rect.left}px`;
  overlay.style.border = `3px solid ${BORDER_COLOR}`;
  overlay.style.borderRadius = '5%';
  svg.parentNode.appendChild(overlay);

  if (isEnablePointerEvents) {
    document.addEventListener('pointermove', handleDocumentMousemove);
    document.addEventListener('pointerup', handleDocumentMouseup);
  } else {
    document.addEventListener('mousemove', handleDocumentMousemove);
    document.addEventListener('mouseup', handleDocumentMouseup);
  }
  disableUserSelect();
}

/**
 * Handle document.mousemove event
 *
 * @param {Event} e The DOM event to handle
 */
function handleDocumentMousemove(e) {
  if (!overlay || !overlay.parentNode) {
    return;
  }
  let svg = overlay.parentNode.querySelector('svg.customAnnotationLayer');
  if (!svg) {
    return;
  }
  let rect = svg.getBoundingClientRect();

  if (originX + (e.clientX - originX) < rect.right) {
    overlay.style.width = `${e.clientX - originX}px`;
  }

  if (originY + (e.clientY - originY) < rect.bottom) {
    overlay.style.height = `${e.clientY - originY}px`;
  }
  overlay.style.borderRadius = "50%";
}

/**
 * Handle document.mouseup event
 *
 * @param {Event} e The DOM event to handle
 */
function handleDocumentMouseup(e) {
  if (overlay) {
    let svg = overlay.parentNode.querySelector('svg.customAnnotationLayer');
    if (!svg) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
      removeDragListeners();
      enableUserSelect();
      return;
    }
    let rx = parseInt(overlay.style.width, 10) / 2;
    let ry = parseInt(overlay.style.height, 10) / 2;
    saveEllipse({
      type: 'ellipse',
      cX: (parseInt(overlay.style.left, 10) + (rx)),
      cY: (parseInt(overlay.style.top, 10) + (ry)),
      rX: rx,
      rY: ry
    },_ellipseColor,_ellipseSize);

    overlay.parentNode.removeChild(overlay);
    overlay = null;

    removeDragListeners();
    enableUserSelect();
  }
}

function removeDragListeners() {
  if (isEnablePointerEvents) {
    document.removeEventListener('pointermove', handleDocumentMousemove);
    document.removeEventListener('pointerup', handleDocumentMouseup);
  } else {
    document.removeEventListener('mousemove', handleDocumentMousemove);
    document.removeEventListener('mouseup', handleDocumentMouseup);
  }
}

/**
 * Handle document.keyup event
 *
 * @param {Event} e The DOM event to handle
 */
function handleDocumentKeyup(e) {
  // Cancel rect if Esc is pressed
  if (e.keyCode === 27) {
    let selection = window.getSelection();
    selection.removeAllRanges();
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
      removeDragListeners();
    }
  }
}

/**
 * Save a rect annotation
 *
 * @param {String} type The type of rect (area, highlight, strikeout, underline)
 * @param {Array} rects The rects to use for annotation
 * @param {String} color The color of the rects
 */
function saveEllipse(ellipse, color, size) {
  let svg = findSVGAtPoint(ellipse.cX - ellipse.rX, ellipse.cY- ellipse.rY);
  let annotation;

  if (!svg) {
    return;
  }

  // Initialize the annotation
  annotation = scaleDown(svg, ellipse);
  annotation = {...annotation, type:'ellipse'};
  annotation.color = color;
  annotation.width = size;
  // Short circuit if no rectangles exist
  if (!annotation) {
    return;
  }


  let {documentId, pageNumber} = getMetadata(svg);

  // Add the annotation
  PDFJSAnnotate.getStoreAdapter().addAnnotation(documentId, pageNumber, annotation)
          .then((annotation) => {
            appendChild(svg, annotation);
          });
}

/**
 * Set the attributes of the ellipse.
 *
 * @param {Number} ellipseSize The size of the lines drawn by the ellipse
 * @param {String} ellipseColor The color of the ellipse
 */
export function setEllipse(ellipseSize = 1, ellipseColor = '000000') {
  _ellipseSize = parseInt(ellipseSize, 10);
  _ellipseColor = ellipseColor;
}

/**
 * Enable rect behavior
 */
export function enableEllipse() {


  if (_enabled) {
    return;
  }

  _enabled = true;
  if (isEnablePointerEvents) {
    document.addEventListener('pointerdown', handleDocumentMousedown);
    document.body && document.body.classList.add('touch-action-disable');
  } else {
    document.addEventListener('mousedown', handleDocumentMousedown);
  }
  document.addEventListener('keyup', handleDocumentKeyup);
}

/**
 * Disable rect behavior
 */
export function disableEllipse() {
  if (!_enabled) {
    return;
  }

  _enabled = false;
  if (isEnablePointerEvents) {
    document.removeEventListener('pointerdown', handleDocumentMousedown);
    document.body && document.body.classList.remove('touch-action-disable');
  } else {
    document.removeEventListener('mousedown', handleDocumentMousedown);
  }
  removeDragListeners();
  document.removeEventListener('keyup', handleDocumentKeyup);
}
