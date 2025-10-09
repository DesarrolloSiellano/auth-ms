FROM node:22.13.0-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install -g @nestjs/cli

COPY . .

RUN npm run build

EXPOSE 3010

CMD ["node", "dist/main"]
