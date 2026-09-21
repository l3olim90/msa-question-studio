import katex from 'katex';
import { mathParts } from '@/lib/math-text';
export function Maths({
  text,
  inline = false,
}: {
  text: string;
  inline?: boolean;
}) {
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
        displayMode: m.display && !inline,
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
          className={m.display && !inline ? 'display-equation' : ''}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <code key={`m${m.index}`}>{m.raw}</code>
      ),
    );
    pos = m.index + m.raw.length;
  }
  bits.push(<span key="tail">{text.slice(pos).replace(/\\\$/g, '$')}</span>);
  return inline ? (
    <span className="math-text math-text-inline">{bits}</span>
  ) : (
    <div className="math-text">{bits}</div>
  );
}
