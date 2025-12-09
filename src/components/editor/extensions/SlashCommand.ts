
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css' // optional for styling
import { CommandList } from './CommandList'
import { Heading1, Heading2, Heading3, List, ListOrdered, Quote, Text as IconText } from 'lucide-react'

export const SlashCommand = Extension.create({
    name: 'slashCommand',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                command: ({ editor, range, props }: any) => {
                    props.command({ editor, range })
                },
            },
        }
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ]
    },
})

export const getSuggestionItems = ({ query }: { query: string }) => {
    return [
        {
            title: 'Text',
            icon: IconText,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('paragraph').run()
            },
        },
        {
            title: 'Heading 1',
            icon: Heading1,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
            },
        },
        {
            title: 'Heading 2',
            icon: Heading2,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
            },
        },
        {
            title: 'Heading 3',
            icon: Heading3,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
            },
        },
        {
            title: 'Bullet List',
            icon: List,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run()
            },
        },
        {
            title: 'Ordered List',
            icon: ListOrdered,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run()
            },
        },
        {
            title: 'Blockquote',
            icon: Quote,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBlockquote().run()
            },
        },
        {
            title: 'Divider',
            icon: List, // reusing List for now to avoid import error
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setHorizontalRule().run()
            },
        },
    ].filter(item => item.title.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 10)
}

export const renderItems = () => {
    let component: ReactRenderer | null = null
    let popup: any | null = null

    return {
        onStart: (props: any) => {
            component = new ReactRenderer(CommandList, {
                props,
                editor: props.editor,
            })

            if (!props.clientRect) {
                return
            }

            popup = tippy(document.body, {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                zIndex: 9999,
            })
        },

        onUpdate: (props: any) => {
            component?.updateProps(props)

            if (!props.clientRect) {
                return
            }

            popup?.setProps({
                getReferenceClientRect: props.clientRect,
            })
        },

        onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
                popup?.hide()

                return true
            }

            return (component?.ref as any)?.onKeyDown(props)
        },

        onExit: () => {
            popup?.destroy()
            component?.destroy()
        },
    }
}
