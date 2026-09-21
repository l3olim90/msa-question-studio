import katex from 'katex';
import { mathParts } from '@/lib/math-text';
export function Maths({ text }: { text: string }) {
  const bits = [];
  let pos = 0;
  for (const m of mathParts(text)) {
    bits.push(
      <span key={`t${pos}`}>
        {text.slice(pos, m.index).replace(/\\\$/g, '$')}
      </span>,
    );
    let html;
    try {
      html = katex.renderToString(m.latex, {
        displayMode: m.display,
        throwOnError: true,
        strict: 'ignore',
        trust: false,
      });
    } catch {
      html = null;
    }
    bits.push(
      html ? (
        <span
          key={`m${m.index}`}
          className={m.display ? 'display-equation' : ''}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <code key={`m${m.index}`}>{m.raw}</code>
      ),
    );
    pos = m.index + m.raw.length;
  }
  bits.push(<span key="tail">{text.slice(pos).replace(/\\\$/g, '$')}</span>);
  return <div className="math-text">{bits}</div>;
}
