import { OpenAI } from "openai"
import { AutoParseableTool, makeParseableTool } from "openai/lib/parser"

export interface Agentic {
    say(text: string): Promise<string>
    ask(text: string): Promise<string>
    write(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string>
    forget(): Promise<string>
    memory(): Promise<string>
    availableTools(): Promise<AutoParseableTool<any, true>[]>
}