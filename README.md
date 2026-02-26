# Pollinations API Proxy

A comprehensive proxy server that implements the full Pollinations API with OpenAI compatibility. This server acts as an intermediary to the official Pollinations API at `https://gen.pollinations.ai`.

## Features

- **OpenAI Compatible**: Full compatibility with OpenAI's API format for seamless integration
- **Unified Endpoints**: Access to text, image, audio, and account management in one place
- **Model Discovery**: Combined text and image models listing via `/v1/models`
- **Authentication Support**: Both header-based and query-parameter API key support
- **CORS Enabled**: Web-friendly cross-origin requests

## Endpoints

### Models
- `GET /v1/models` - Get list of all available models (text and image combined)

### Text Generation
- `POST /v1/chat/completions` - Chat completions with OpenAI-compatible format

### Image Generation
- `POST /v1/images/generations` - OpenAI-compatible image generation
- `GET /v1/image/{prompt}` - Simple GET-based image generation with parameters

### Audio
- `POST /v1/audio/speech` - Text-to-speech conversion
- `POST /v1/audio/transcriptions` - Audio transcription

### Account Management
- `GET /v1/account/profile` - Get account profile information
- `GET /v1/account/balance` - Get account balance
- `GET /v1/account/usage` - Get account usage statistics

### File Management
- `GET /v1/files` - List uploaded files
- `POST /v1/files` - Upload a file
- `GET /v1/files/{file_id}` - Get file information
- `DELETE /v1/files/{file_id}` - Delete a file

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Proxy authentication (optional, required if you want to protect your proxy)
PROXY_API_KEY=your-secret-proxy-key

# Server port (optional, defaults to 3000)
PORT=3000
```

## Usage

1. Clone the repository
2. Install Bun runtime
3. Create `.env` file with your configuration
4. Run the server: `bun run server.ts`

## Authentication

The proxy supports two authentication methods:

1. **Header-based**: `Authorization: Bearer YOUR_API_KEY`
2. **Query parameter**: `?key=YOUR_API_KEY`

When using proxy authentication, all requests to `/v1/*` endpoints require the proxy's API key. The proxy will forward your upstream API key (if provided) to the official Pollinations API.

## Docker Deployment

```dockerfile
FROM oven/bun:1

WORKDIR /app
COPY server.ts .

# Expose port 3000
EXPOSE 3000

# Chạy server
CMD ["bun", "run", "server.ts"]
```

Build and run:
```bash
docker build -t pollinations-proxy .
docker run -p 3000:3000 -e PROXY_API_KEY=your-key-here pollinations-proxy
```

## Upstream API

The proxy forwards requests to `https://gen.pollinations.ai` which is the unified gateway for all Pollinations services. This includes access to the latest models and features.

## License

MIT