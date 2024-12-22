import { OpenAI, } from 'openai'
import { AutoParseableTool, makeParseableTool } from "openai/lib/parser"
import { ChatCompletionStreamingToolRunnerParams } from "openai/lib/ChatCompletionStreamingRunner"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Ask, FillArguments } from "./chat.js"
import { lineRewriter, messageReducer } from "./utils.js"
import { Agentic } from "./types"
import { callTool } from "./tools"
import { mcpTools } from "./tools/mcp.js"
import { builtinTools } from "./tools/builtin.js"
import { SYSTEM_PROMPT } from "./prompts/system.js"
import { parseAssistantMessageI } from "../core/assistant-message/parse-assistant-message.js"
import { Stream } from "openai/streaming"

export class Agent implements Agentic {
    config: { mcpServers: { [Key: string]: any } }
    mcpServers: { [id: string]: Client } = {}
    client: OpenAI | undefined = undefined
    model: string | undefined = undefined
    memoryMessages: Array<OpenAI.ChatCompletionMessageParam> = []
    CHUNK_DELAY_MS = 20
    mcpClientUsing: Client[] = []
    queries: string[] = []
    infinityRun: boolean = false
    toolsCallMode: "openai" | "xml" = "xml"
    abort: boolean = false
    toolUseMap: { [Key: string]: string[] } = {}
    workDirectory = "./"
    constructor(config: { mcpServers: { [Key: string]: any } }) {
        this.config = config
    }
    configProvider(client: OpenAI, model: string) {
        this.client = client
        this.model = model
    }
    formatSchema(name: string, schemas: OpenAI.FunctionParameters | undefined): string {
        let args = ""
        let argsNames: string[] = []
        if (schemas !== undefined || Object.keys(schemas || []).length > 0) {
            args = Object.entries((schemas as { [Key: string]: { [Key: string]: string } }).properties || []).map((v, i, a) => {
                argsNames.push(`arg_${v[0]}`)
                return `<arg_${v[0]}>${typeof v[1] === "string" ? v[1] : (v[1] as { type: string }).type} type</arg_${v[0]}>`
            }).join("\n")
        }
        if (args === "") {
            args = "\n"
        } else {
            args = "\n".concat(args).concat("\n")
        }
        this.toolUseMap[name] = argsNames
        return `<${name}>${args}</${name}>`
    }
    async formatToolsPrompt(): Promise<string> {
        return (await this.availableTools()).map((v, i, a) => (`## ${v.function.name}\nDescription: ${v.function.description}\nUsage:\n${this.formatSchema(v.function.name, v.function.parameters)}`)).join("\n\n")
    }
    async systemMessages(): Promise<Array<OpenAI.ChatCompletionMessageParam>> {
        return [
            {
                role: 'system', content: await SYSTEM_PROMPT(this.workDirectory, false, await this.formatToolsPrompt())
            },
        ]
    }
    async #buildRequestMessages(): Promise<Array<OpenAI.ChatCompletionMessageParam>> {
        if (this.memoryMessages.length === 0 || this.memoryMessages[this.memoryMessages.length - 1].content?.toString().startsWith("<|awaking_with_memory_context|>")) {
            this.memoryMessages = this.memoryMessages.concat([{
                role: "user",
                content: this.queries.pop() || "No tasks to executed, Thought or Idle",
            }])
        }
        const callMessages = (await this.systemMessages()).concat(this.memoryMessages)
        return callMessages
    }
    async #ChatRequest() {
        if (!this.client || !this.model) {
            throw Error("Client or model is not set")
        }
        const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
            stream: true,
            model: this.model || "",
            messages: await this.#buildRequestMessages(),
            temperature: 0.7,
            tools: this.toolsCallMode === "openai" ? await this.availableTools() : [],
            tool_choice: "auto",
            // stop: []
        }
        return await this.client?.chat.completions.create(params)
    }
    async #initServer(config: { mcpServers: { [Key: string]: any } }) {
        let mcpServers: { [id: string]: any } = {}
        for (const [k, v] of Object.entries(config.mcpServers)) {
            const transport = new StdioClientTransport({
                command: v.command,
                args: v.args,
                env: v.env
            })
            mcpServers[k] = new Client({
                name: k,
                version: "1.0.0",
            }, {
                capabilities: {}
            })
            await mcpServers[k].connect(transport)
        }
        return mcpServers
    }
    async initServer() {
        this.mcpServers = await this.#initServer(this.config)
    }
    async #OpenAiToolUseMode(stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>) {
        let writeLine = lineRewriter();
        let message = {} as OpenAI.Chat.ChatCompletionMessage;
        for await (const chunk of stream) {
            message = messageReducer(message, chunk);
            writeLine(this.memoryMessages);
            process.stdout.write(chunk.choices[0]?.delta?.content || '')

            // Add a small delay so that the chunks coming in are noticable
            await new Promise((resolve) => setTimeout(resolve, this.CHUNK_DELAY_MS));
        }

        this.memoryMessages.push(message)

        // If there are no tool calls, we're done and can exit this loop
        if (!message.tool_calls) {
            if (this.infinityRun) {
                message.tool_calls = ((message.tool_calls ? message.tool_calls : []) as Array<OpenAI.Chat.ChatCompletionMessageToolCall>).concat(
                    [
                        {
                            "id": "helper", "function": {
                                "name": "helper", "arguments": JSON.stringify({
                                    type: "tool", message: "idle"
                                })
                            }, type: "function"
                        },
                    ]
                )
            } else {
                this.abort = true
                return
            }
        }

        // If there are tool calls, we generate a new message with the role 'tool' for each tool call.
        for (const toolCall of message.tool_calls) {
            const result = await callTool(toolCall, await this.availableTools());
            const newMessage = {
                tool_call_id: toolCall.id,
                role: 'tool' as const,
                name: toolCall.function.name,
                content: typeof result === "string" ? result : JSON.stringify(result),
            };
            this.memoryMessages.push(newMessage);
        }
    }
    async #XmlToolUseMode(stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>) {
        let message: OpenAI.ChatCompletionMessageParam = {
            role: "assistant",
            content: "",
        }
        let toolUses = []
        let assistantMessage = ""
        try {
            for await (const chunk of stream) {
                process.stdout.write(chunk.choices[0]?.delta?.content || '')
                assistantMessage += chunk.choices[0]?.delta?.content || ''
                // parse raw assistant message into content blocks
                const assistantMessages = parseAssistantMessageI(assistantMessage, this.toolUseMap, "arg_")
                let run = assistantMessages.map(async (v, i, a) => {
                    switch (v.type) {
                        case "text":
                            message.content = assistantMessage
                            break
                        case "tool_use":
                            if (v.partial === false) {
                                toolUses.push(v)
                                const result = await callTool({
                                    id: v.name,
                                    type: "function",
                                    function: {
                                        name: v.name,
                                        arguments: JSON.stringify(v.params)
                                    }
                                }, await this.availableTools())
                                return {
                                    role: "assistant",
                                    content: `===tool result of${v.name}==\n${typeof result === "string" ? result : result.content[0]?.text}`,
                                } as OpenAI.ChatCompletionMessageParam
                            }

                            break
                    }
                    return undefined
                })
                const toolMessages = (await Promise.all(run)).filter((x) => x) as OpenAI.ChatCompletionMessageParam[]
                if (toolMessages.length > 0) {
                    this.memoryMessages.push(message)
                    this.memoryMessages = this.memoryMessages.concat(toolMessages)
                    return
                }
            }
            this.memoryMessages.push(message)
        } catch (error) {

        }
        if (toolUses.length === 0) {
            this.abort = true
        }
    }
    async #runAgent() {
        this.abort = false
        while (true) {
            const stream = await this.#ChatRequest()

            if (stream === undefined) {
                throw Error("Failed to run")
            }

            switch (this.toolsCallMode) {
                case "openai":
                    await this.#OpenAiToolUseMode(stream)
                    break
                case "xml":
                    await this.#XmlToolUseMode(stream)
                    break
            }
            if (this.abort) {
                break
            }
        }
    }
    async run(queries: string[], cwd: string) {
        this.workDirectory = cwd
        this.queries = queries
        await this.initServer()
        this.mcpClientUsing = Object.values(this.mcpServers)
        await this.#runAgent()
    }
    async say(text: string): Promise<string> {
        return ""
    }
    async ask(text: string): Promise<string> {
        return ""
    }
    async write(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
        return ""
    }
    async forget(): Promise<string> {
        this.memoryMessages = []
        return "clear memory"
    }
    async memory(): Promise<string> {
        return ""
    }
    async availableTools(): Promise<AutoParseableTool<any, true>[]> {
        return builtinTools(this).concat(await mcpTools(this, this.mcpClientUsing))
    }
}