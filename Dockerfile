# Dockerfile
FROM oven/bun:1

WORKDIR /app
COPY server.ts .

# Expose port 3000
EXPOSE 3000

# Chạy server
CMD ["bun", "run", "server.ts"]
