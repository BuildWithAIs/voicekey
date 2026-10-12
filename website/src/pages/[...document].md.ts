import { documents } from '../content'
export function getStaticPaths() {
  return documents.map((doc) => ({
    params: { document: `${doc.lang === 'zh' ? 'zh/' : ''}${doc.path}` },
    props: { doc },
  }))
}
export function GET({ props }: { props: { doc: (typeof documents)[number] } }) {
  const { doc } = props
  const body = `# ${doc.title}\n\n> ${doc.description}\n\n${doc.sections.map(([title, text]) => `## ${title}\n\n${text}`).join('\n\n')}\n\n## Links\n\n- [Releases](https://github.com/BuildWithAIs/voicekey/releases/latest)\n- [Source](https://github.com/BuildWithAIs/voicekey)\n`
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
