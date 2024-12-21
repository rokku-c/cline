import { OpenAI, } from 'openai'
import { Agentic } from "../types"

export function helperTools(agent: Agentic) {
    return async function helper(args: { type: string, message: string }) {
        if (args.type === 'error') {
            return `error occur: ${args.type}: ${args.message}`
        }
        if (args.type === 'tool') {
            const tools = (await agent.availableTools()).filter((x) => (x.function.name === args.message))
            if (tools.length === 0) {
                return `tool not found.`
            }
            const tool = tools[0]
            const properties = tool.function.parameters?.properties as Record<string, any>
            let callArgs: { [Key: string]: any } = {}
            if (tool.function.parameters?.properties === undefined || Object.keys(properties).length === 0) {
                callArgs = {}
            } else {
                for (const [k, v] of Object.entries(properties)) {
                    let input = await agent.write(([
                        {
                            role: "system",
                            content: `<|context_start|>\n${agent.memory()}\n<|context_end|>\nArgument of ${k} (type ${v.type}) Input of ${v.type === "string" ? "plaintext no escape and backquote surround" : v.type} now and mark finish with <|im_end|> or <|end_of_text|>\n`
                        },
                        {
                            role: "system",
                            content: "ERROR INPUT HISTORY\nyour first input:\n```\njson\n...````\nyour second input:\n```\ngo\n...````\n"
                        },
                        {
                            role: "system",
                            content: `INPUT ERROR, please re-input again without json format <|im_start|>${k}:\n`
                        },
                    ]) as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
                    if (v.type === "number") {
                        callArgs[k] = Number(input)
                    } else {
                        callArgs[k] = input
                    }
                }
            }
            if (tool.$callback !== undefined) {
                return await tool.$callback(callArgs)
            } else {
                return `tool internal error`
            }
        }
    }
}

