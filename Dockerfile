FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

# instalar TODO (prod + dev)
RUN npm ci

COPY . ./

# compilar
RUN npm run build

# quitar devDependencies para aligerar la imagen final
RUN npm prune --omit=dev

EXPOSE 3000
CMD ["node", "dist/server.js"]
