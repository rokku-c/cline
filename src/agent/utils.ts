import { OpenAI, } from 'openai'
import util from 'util'

export function lineRewriter() {
    let lastMessageLines = 0;
    return function write(value: any) {
        process.stdout.cursorTo(0);
        process.stdout.moveCursor(0, -lastMessageLines);

        // calculate where to move cursor back for the next move.
        const text = util.formatWithOptions({ colors: false, breakLength: Infinity, depth: 4 }, value);
        const __LINE_BREAK_PLACE_HOLDER__ = '__LINE_BREAK_PLACE_HOLDER__';
        const lines = text
            // @ts-ignore-error this requires es2021
            .replaceAll('\\n', __LINE_BREAK_PLACE_HOLDER__)
            .split('\n')
            // @ts-ignore-error this requires es2021
            .map((line: string) => line.replaceAll(__LINE_BREAK_PLACE_HOLDER__, '\\n'));
        lastMessageLines = -1;
        for (const line of lines) {
            const lineLength = line.length;
            lastMessageLines += Math.ceil(lineLength / process.stdout.columns);
        }
        lastMessageLines = Math.max(lastMessageLines, 0);

        process.stdout.clearScreenDown();
        process.stdout.write(util.formatWithOptions({ colors: true, breakLength: Infinity, depth: 4 }, value));
    };
}

export function messageReducer(previous: OpenAI.Chat.ChatCompletionMessage, item: OpenAI.Chat.ChatCompletionChunk): OpenAI.Chat.ChatCompletionMessage {
    const reduce = (acc: any, delta: any) => {
        acc = { ...acc };
        for (const [key, value] of Object.entries(delta)) {
            if (acc[key] === undefined || acc[key] === null) {
                acc[key] = value;
            } else if (typeof acc[key] === 'string' && typeof value === 'string') {
                if (key === 'content') {
                    (acc[key] as string) += value;
                } else {
                    (acc[key] as string) = value;
                }
            } else if (typeof acc[key] === 'object' && !Array.isArray(acc[key])) {
                acc[key] = reduce(acc[key], value);
            }
        }
        return acc;
    };

    return reduce(previous, item.choices[0]!.delta) as OpenAI.Chat.ChatCompletionMessage;
}