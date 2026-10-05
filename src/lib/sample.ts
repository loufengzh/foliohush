import type { JSONContent } from '@tiptap/react'
export const welcomeContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'A small, quiet place to turn a passing thought into something worth keeping.',
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Make room for the first sentence' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'The hardest part of writing is often everything around it. The tabs. The tools. The feeling that an idea needs to be finished before it deserves a page.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Here, a page can simply be a beginning. Select a few words to give them emphasis, or type ',
        },
        { type: 'text', text: '/', marks: [{ type: 'code' }] },
        { type: 'text', text: ' on an empty line to try a new shape.' },
      ],
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A good writing space gives your ideas room to breathe.' },
          ],
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'A little less friction' }],
    },
    {
      type: 'bulletList',
      content: [
        'Write first. Format when it helps the thought.',
        'Save a snapshot before taking a draft in a new direction.',
        'Take your words with you. Export a portable copy anytime.',
      ].map((text) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Your words, on your terms' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'This desk saves in this browser, on this device. There is no account and no cloud sync. Export a JSON backup for safekeeping, or a clean HTML or Markdown copy for wherever you publish next.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Now, make this page yours.', marks: [{ type: 'italic' }] }],
    },
  ],
}
