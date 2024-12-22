import { Cline } from "./core/Cline"
import { OpenAI } from "openai"
import { Agent } from "./agent"

const cwd = "./"

const config = {
    "mcpServers": {
        "filesystem": {
            "command": "bun",
            "args": [
                "x",
                "@modelcontextprotocol/server-filesystem",
                cwd,
            ],
            "env": {
                "https_proxy": "http://127.0.0.1:7890",
                "http_proxy": "http://127.0.0.1:7890"
            }
        },
        "memory": {
            "command": "bun",
            "args": [
                "x",
                "@modelcontextprotocol/server-memory"
            ],
            "env": {
                "https_proxy": "http://127.0.0.1:7890",
                "http_proxy": "http://127.0.0.1:7890"
            }
        }
    }
}

new Promise(() => {
    const agent = new Agent(config)
    agent.configProvider(new OpenAI({
        baseURL: "http://127.0.0.1:3000/v1",
        apiKey: "EMPTY",
    }), 'qwen2.5-72b-chat')
    agent.run(["hi"], cwd)
})