import { OpenAI, } from 'openai'
import { AutoParseableTool, makeParseableTool } from "openai/lib/parser"
import { Agentic } from "../types"
import { helperTools } from './helper'

export function builtinTools(agent: Agentic) {
    return [
        makeParseableTool<any>({
            type: 'function',
            function: {
                name: "search",
                description: "search engine for help you any question",
                parameters: {
                    type: 'object', properties: {
                        query: "string"
                    }
                },
            }
        }, { callback: async (args) => { return await agent.ask(args.query) }, parser: JSON.parse }) as AutoParseableTool<any, true>,
        makeParseableTool<any>({
            type: 'function',
            function: {
                name: "thought",
                description: "thought and take note",
                parameters: {
                    type: 'object', properties: {
                        thought: "string"
                    }
                },
            }
        }, { callback: async (args) => { return `<|my_thought|>${args.thought}<|my_thought|>` }, parser: JSON.parse }) as AutoParseableTool<any, true>,
        makeParseableTool<any>({
            type: 'function',
            function: {
                name: "say",
                description: "say something to answer",
                parameters: {
                    type: 'object', properties: {
                        say: "string"
                    }
                },
            }
        }, { callback: async (args) => { agent.say(args.say) }, parser: JSON.parse }) as AutoParseableTool<any, true>,
        makeParseableTool<any>({
            type: 'function',
            function: {
                name: "idle",
                description: "idle when you feel all job done, time unit is second, archive you memory",
                parameters: {
                    type: 'object', properties: {
                        time: "number"
                    }
                },
            }
        }, {
            callback: async (args) => {
                let memory = await agent.write(([
                    {
                        role: "system",
                        content: `<|context_start|>\n${agent.memory()}\n<|context_end|>\nSummary you memory of context for next use:\n`
                    }
                ]) as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
                agent.forget()
                new Promise(resolve => setTimeout(resolve, args.time * 1000)); return `<|awaking_with_memory_context|>${memory}<|awaking_with_memory_context|>`
            }, parser: JSON.parse
        }) as AutoParseableTool<any, true>,
        makeParseableTool<any>({
            type: 'function',
            function: {
                name: "helper",
                description: "error helper",
                parameters: {
                    type: 'object', properties: {
                        type: "string",
                        message: "string",
                    }
                },
            }
        }, { callback: async (args) => { return await helperTools(agent)(args) }, parser: JSON.parse }) as AutoParseableTool<any, true>,
    ]
}