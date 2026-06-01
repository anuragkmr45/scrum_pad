import setAttributes from '../utils/setAttributes';
import normalizeColor from '../utils/normalizeColor';

/**
 * Create SVGTextElement from an annotation definition.
 * This is used for anntations of type `textbox`.
 *
 * @param {Object} a The annotation definition
 * @return {SVGTextElement} A text to be rendered
 */
export default function renderText(a) {
  var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');

  setAttributes(text, {
    x: a.mode === 'note' ? a.x + 8 : a.x,
    y: a.y + parseInt(a.size, 10) + (a.mode === 'note' ? 8 : 0),
    dy: 0,
    width: a.width,
    height: a.height,
    fill: normalizeColor(a.color || '#000'),
    fontSize: a.size
  });
  text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space","preserve");
  let content = a.content;
  let htmlContent = '';
  let lines = content.split("\n");
  lines.forEach(function (value, index) {
    value = value ? value : " ";
    htmlContent = htmlContent + '<tspan x="' + (a.mode === 'note' ? a.x + 8 : a.x) + '"  dy="' + (index ? (parseInt(a.size, 10) + 5) : 0) + 'px" xml:space="preserve">' + value + '</tspan>';
  });

  text.innerHTML = htmlContent;

  if (a.mode === 'note') {
    var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    var width = Math.max(parseFloat(a.width || 0), 136);
    var height = Math.max(parseFloat(a.height || 0), 46);

    setAttributes(rect, {
      x: a.x - 6,
      y: a.y - 4,
      width: width + 18,
      height: height + 18,
      rx: 10,
      ry: 10,
      fill: '#fffcf2',
      stroke: '#eb5e28',
      strokeWidth: 1.25,
      opacity: 0.96
    });

    group.appendChild(rect);
    group.appendChild(text);
    return group;
  }

  return text;
}
