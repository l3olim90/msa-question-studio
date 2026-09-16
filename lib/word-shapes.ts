import { layoutLabels, labelMetrics } from './label-layout';
import type { Draft } from './schema';
import { mathParts } from './math-text';
import { escapeXML as esc } from './diagram';
const unit = (v: number) => Math.round(v * 6858);
const fill = (c: string) =>
  c === 'none'
    ? '<a:noFill/>'
    : `<a:solidFill><a:srgbClr val="${c.replace('#', '')}"/></a:solidFill>`;
export function wordShapes(
  diagram: Draft['diagrams'][number],
  id: number,
  equation: (latex: string) => string,
) {
  const shapes = layoutLabels(diagram.shapes)
    .map((s, index) => {
      let x = s.x,
        y = s.y,
        w = s.width,
        h = s.height,
        geom = '',
        text = '';
      const isText = s.type === 'text' || s.type === 'math';
      if (isText) {
        const metrics = labelMetrics(s);
        y = Math.max(0, y - 22);
        w = metrics.width;
        h = metrics.height;
        geom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
        const plain = (value: string) =>
          `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(value)}</w:t></w:r>`;
        let content = '';
        if (s.type === 'math' || /^[A-Za-z]$/.test(s.text.trim()))
          content = `<m:oMathPara><m:oMathParaPr><m:jc m:val="left"/></m:oMathParaPr>${equation(s.text.replace(/^\$|\$$/g, ''))}</m:oMathPara>`;
        else {
          let pos = 0;
          for (const m of mathParts(s.text)) {
            content += plain(s.text.slice(pos, m.index)) + equation(m.latex);
            pos = m.index + m.raw.length;
          }
          content += plain(s.text.slice(pos));
        }
        text = `<wps:txbx><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${content}</w:p></w:txbxContent></wps:txbx>`;
      } else if (s.type === 'rect' || s.type === 'ellipse') {
        if (s.type === 'ellipse') {
          x -= w / 2;
          y -= h / 2;
        }
        geom = `<a:prstGeom prst="${s.type}"><a:avLst/></a:prstGeom>`;
      } else {
        const points =
          s.type === 'line' || s.type === 'arrow' || s.type === 'measurement'
            ? [
                { x: s.x, y: s.y },
                { x: s.x2, y: s.y2 },
              ]
            : s.points;
        if (!points.length) return '';
        x = Math.min(...points.map((p) => p.x));
        y = Math.min(...points.map((p) => p.y));
        w = Math.max(1, Math.max(...points.map((p) => p.x)) - x);
        h = Math.max(1, Math.max(...points.map((p) => p.y)) - y);
        const pt = (p: { x: number; y: number }) =>
          `<a:pt x="${unit(p.x - x)}" y="${unit(p.y - y)}"/>`;
        let path = `<a:moveTo>${pt(points[0])}</a:moveTo>`;
        if (s.type === 'curve') {
          for (let i = 1; i + 2 < points.length; i += 3)
            path += `<a:cubicBezTo>${points
              .slice(i, i + 3)
              .map(pt)
              .join('')}</a:cubicBezTo>`;
        } else
          path += points
            .slice(1)
            .map((p) => `<a:lnTo>${pt(p)}</a:lnTo>`)
            .join('');
        // SVG fills open polylines/curves by implicitly joining their ends.
        // DrawingML must also permit path filling; spPr's colour alone is insufficient.
        const pathFill =
          (s.type === 'polyline' || s.type === 'curve') && s.fill !== 'none'
            ? 'norm'
            : 'none';
        geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${unit(w)}" h="${unit(h)}" fill="${pathFill}">${path}</a:path></a:pathLst></a:custGeom>`;
      }
      return `<wps:wsp><wps:cNvPr id="${id * 100 + index + 1}" name="${s.type} ${index + 1}"/><wps:cNvSpPr${isText ? ' txBox="1"' : ''}/><wps:spPr><a:xfrm><a:off x="${unit(x)}" y="${unit(y)}"/><a:ext cx="${unit(w)}" cy="${unit(h)}"/></a:xfrm>${geom}${fill(isText ? 'none' : s.fill)}<a:ln w="19050">${isText ? '<a:noFill/>' : fill('#000000')}${s.type === 'measurement' ? '<a:headEnd type="triangle" w="med" len="med"/>' : ''}${s.type === 'arrow' || s.type === 'measurement' ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ''}</a:ln></wps:spPr>${text}<wps:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></wps:bodyPr></wps:wsp>`;
    })
    .join('');
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:keepNext/></w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="5486400" cy="3429000"/><wp:wrapTopAndBottom/><wp:docPr id="${id}" name="Editable diagram ${id}" descr="${esc(diagram.caption)}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5486400" cy="3429000"/><a:chOff x="0" y="0"/><a:chExt cx="5486400" cy="3429000"/></a:xfrm></wpg:grpSpPr>${shapes}</wpg:wgp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
}
