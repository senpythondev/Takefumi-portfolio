import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { Block } from '@/content';
import { LINKS } from '@/content/links';
import { EmailReveal } from '@/components/contact/EmailReveal';
import { GentenEval } from './GentenEval';
import { RichText, type RichContext } from './RichText';

type Level = 2 | 3 | 4 | 5 | 6;

/** A heading at a level relative to where the blocks sit (a case study's blocks start at h2, the finale's at h3). */
function H({ level, children, id, className }: { level: number; children: ReactNode; id?: string; className?: string }) {
  const Tag = `h${Math.min(6, Math.max(2, level)) as Level}` as const;
  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}

export async function BlockView({ block, ctx, id, level = 3 }: { block: Block; ctx: RichContext; id: string; level?: number }) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p className="block-paragraph">
          <RichText text={block.text} ctx={ctx} />
        </p>
      );

    case 'list':
      return (
        <div className="block-list">
          {block.heading ? <H level={level}>{block.heading}</H> : null}
          <ul>
            {block.items.map((item, i) => (
              <li key={i}>
                <RichText text={item} ctx={ctx} />
              </li>
            ))}
          </ul>
        </div>
      );

    case 'tech':
      return (
        <div className="block-tech">
          <H level={level}>{block.heading}</H>
          <ul className="tech-list">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      );

    case 'chips':
      return (
        <ul className="chips">
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} ctx={ctx} compact />
            </li>
          ))}
        </ul>
      );

    case 'availability':
      return <p className="availability">{block.text}</p>;

    case 'summary':
      return (
        <section id="summary" className="summary-card" aria-labelledby={`${id}-heading`}>
          <h2 id={`${id}-heading`}>{block.heading}</h2>
          <ul>
            {block.items.map((item, i) => (
              <li key={i}>
                <RichText text={item} ctx={ctx} />
              </li>
            ))}
          </ul>
        </section>
      );

    case 'notice': {
      const tc = await getTranslations('confidence');
      return (
        <p className="notice" data-tone={block.tone} role="note">
          {block.tone === 'reconstructed' ? (
            <span className="metric-badge" data-confidence="reconstructed">
              {tc('reconstructed')}
            </span>
          ) : null}
          {block.text}
        </p>
      );
    }

    case 'timeline':
      return (
        <div className="block-timeline">
          <H level={level}>{block.heading}</H>
          <ol>
            {block.items.map((item, i) => (
              <li key={i}>
                <span className="timeline-when">{item.when}</span>
                <span className="timeline-what">{item.what}</span>
              </li>
            ))}
          </ol>
        </div>
      );

    case 'projects': {
      const t = await getTranslations('projects');
      return (
        <div className="block-projects">
          <H level={level}>{block.heading}</H>
          <ol className="projects">
            {block.projects.map((p) => (
              <li key={p.id} className="project" data-project={p.id}>
                <article aria-labelledby={`project-${p.id}`}>
                  <H level={level + 1} id={`project-${p.id}`} className="project-title">
                    {p.title}
                  </H>
                  <dl className="project-facts">
                    <div>
                      <dt>{t('period')}</dt>
                      <dd>{p.period}</dd>
                    </div>
                    <div>
                      <dt>{t('industry')}</dt>
                      <dd>{p.industry}</dd>
                    </div>
                    <div>
                      <dt>{t('role')}</dt>
                      <dd>{p.role}</dd>
                    </div>
                    <div>
                      <dt>{t('team')}</dt>
                      <dd>
                        <RichText text={p.team} ctx={ctx} />
                      </dd>
                    </div>
                  </dl>
                  <p>{p.summary}</p>
                  {p.results.length > 0 ? (
                    <>
                      <H level={level + 2} className="project-sub">
                        {t('results')}
                      </H>
                      <ul className="project-results">
                        {p.results.map((r, i) => (
                          <li key={i}>
                            <RichText text={r} ctx={ctx} />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <H level={level + 2} className="project-sub">
                    {t('tech')}
                  </H>
                  <ul className="tech-list">
                    {p.tech.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    case 'skills':
      return (
        <div className="block-skills">
          <H level={level}>{block.heading}</H>
          <dl className="skills">
            {block.levels.map((level) => (
              <div key={level.grade} data-grade={level.grade}>
                <dt>
                  <span className="skill-grade">{level.grade}</span>
                  {level.description ? <span className="skill-desc">{level.description}</span> : null}
                </dt>
                {level.items.map((item, i) => (
                  <dd key={i}>
                    <RichText text={item} ctx={ctx} />
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </div>
      );

    case 'genten-eval':
      return <GentenEval block={block} ctx={ctx} headingId={`${id}-heading`} level={level} />;

    case 'citation': {
      const t = await getTranslations('links');
      const { quote, context, sourceLabel, sourceLink, basis } = block.citation;
      const href = LINKS[sourceLink];
      return (
        <figure className="citation">
          <blockquote cite={href}>
            <p>{quote}</p>
          </blockquote>
          <figcaption>
            {context ? <p className="citation-context">{context}</p> : null}
            <p className="citation-source">
              <a href={href} target="_blank" rel="noopener noreferrer">
                {sourceLabel}
                <span className="sr-only">{t('external')}</span>
                <span aria-hidden="true"> ↗</span>
              </a>
              {basis ? <span className="citation-basis">{basis}</span> : null}
            </p>
          </figcaption>
        </figure>
      );
    }

    case 'creeds':
      return (
        <ol className="creeds">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );

    case 'contact': {
      const t = await getTranslations('contact');
      return (
        <div className="block-contact">
          <H level={level}>{block.heading}</H>
          <EmailReveal labels={{ copy: t('copy'), copied: t('copied'), noscript: t('noscript') }} />
        </div>
      );
    }

    case 'links': {
      const t = await getTranslations('links');
      return (
        <div className="block-links">
          <H level={level}>{block.heading}</H>
          <ul className="links">
            {block.links.map((l) => (
              <li key={l.key}>
                <a href={LINKS[l.key]} target="_blank" rel="noopener noreferrer">
                  {l.label}
                  <span className="sr-only">{t('external')}</span>
                  <span aria-hidden="true"> ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }
}
