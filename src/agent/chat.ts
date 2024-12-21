import OpenAI from 'openai'

export async function Ask(c: OpenAI, model: string, query: string) {
    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
        messages: [
            { role: 'system', content: 'you are a helpful assistant.' },
            { role: 'user', content: query },
        ],
        model: model,
        stream: true,
        temperature: 0.001,
        seed: 33,
    }
    const stream = await c.beta.chat.completions.stream(params)
    let resp = ""
    stream.on('content', (delta, snapshot) => {
        process.stdout.write(delta)
        resp += resp
    })
    await stream.done()
    return resp
}


export async function FillArguments(c: OpenAI, model: string, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], stop: string[]) {
    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
        messages: messages,
        model: model,
        stream: true,
        temperature: 0.001,
        seed: 33,
        stop: stop,
    }
    process.stdout.write("<|helper_start|>")
    const stream = await c.beta.chat.completions.stream(params)
    let resp = ""
    stream.on('content', (delta, snapshot) => {
        process.stdout.write(delta)
        resp += delta
    })
    await stream.done()
    process.stdout.write("<|helper_end|>")
    return resp
}

