
import { Mark, mergeAttributes } from '@tiptap/core';

export interface EntityMarkOptions {
    HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        entityMark: {
            setEntityMark: (attributes: { id: string; description: string; category: string; color: string }) => ReturnType;
            unsetEntityMark: () => ReturnType;
        };
    }
}

export const EntityMark = Mark.create<EntityMarkOptions>({
    name: 'entity',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-entity-id'),
                renderHTML: attributes => {
                    if (!attributes.id) {
                        return {};
                    }
                    return {
                        'data-entity-id': attributes.id,
                    };
                },
            },
            description: {
                default: null,
                parseHTML: element => element.getAttribute('data-entity-description'),
                renderHTML: attributes => {
                    if (!attributes.description) {
                        return {};
                    }
                    return {
                        'data-entity-description': attributes.description,
                    };
                },
            },
            category: {
                default: 'object',
                parseHTML: element => element.getAttribute('data-entity-category'),
                renderHTML: attributes => {
                    return {
                        'data-entity-category': attributes.category,
                    };
                },
            },
            color: {
                default: '#fde047',
                parseHTML: element => element.getAttribute('data-entity-color'),
                renderHTML: attributes => {
                    return {
                        'data-entity-color': attributes.color,
                        style: `text-decoration-line: underline; text-decoration-style: dashed; text-decoration-color: ${attributes.color}; text-decoration-thickness: 2px; text-underline-offset: 3px; background-color: transparent; cursor: help;`,
                    };
                },
            },
            image: {
                default: null,
                parseHTML: element => element.getAttribute('data-entity-image'),
                renderHTML: attributes => {
                    if (!attributes.image) {
                        return {};
                    }
                    return {
                        'data-entity-image': attributes.image,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-entity-id]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setEntityMark:
                attributes =>
                    ({ commands }) => {
                        return commands.setMark(this.name, attributes);
                    },
            unsetEntityMark:
                () =>
                    ({ commands }) => {
                        return commands.unsetMark(this.name);
                    },
        };
    },
});
