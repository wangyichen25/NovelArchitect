
import React, { Component, useEffect, useImperativeHandle, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Heading1, Heading2, Heading3, List, ListOrdered, Quote, Text } from 'lucide-react'

export const CommandList = React.forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    const selectItem = (index: number) => {
        const item = props.items[index]

        if (item) {
            props.command(item)
        }
    }

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
    }

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
    }

    const enterHandler = () => {
        selectItem(selectedIndex)
    }

    useEffect(() => {
        setSelectedIndex(0)
    }, [props.items])

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                upHandler()
                return true
            }

            if (event.key === 'ArrowDown') {
                downHandler()
                return true
            }

            if (event.key === 'Enter') {
                enterHandler()
                return true
            }

            return false
        },
    }))

    return (
        <div className="bg-popover text-popover-foreground border rounded-md shadow-md overflow-hidden p-1 min-w-[200px]">
            {props.items.length ? (
                props.items.map((item: any, index: number) => (
                    <button
                        className={`flex items-center gap-2 w-full text-left px-2 py-1.5 text-sm rounded-sm ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
                        key={index}
                        onClick={() => selectItem(index)}
                    >
                        {item.icon && <item.icon className="w-4 h-4 mr-1" />}
                        {item.title}
                    </button>
                ))
            ) : (
                <div className="px-2 py-1 text-sm text-muted-foreground">No result</div>
            )}
        </div>
    )
})

CommandList.displayName = 'CommandList'
