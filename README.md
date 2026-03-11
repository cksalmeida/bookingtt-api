<h1 align="center">🚌 BookingTT API</h1>

<p align="center">
  API de reservas de poltronas para viagens de ônibus com controle de concorrência distribuída.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/RabbitMQ-3.12-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white" alt="RabbitMQ" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

---

## 📋 Sumário

- [Sobre o Projeto](#-sobre-o-projeto)
- [Stack Tecnológica](#-stack-tecnológica)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura](#-arquitetura)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação e Execução](#-instalação-e-execução)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Endpoints da API](#-endpoints-da-api)
- [Modelos de Dados](#-modelos-de-dados)
- [Padrões Arquiteturais](#-padrões-arquiteturais)
- [Testes](#-testes)
- [Estrutura do Projeto](#-estrutura-do-projeto)

---

## 🎯 Sobre o Projeto

O **BookingTT API** é um sistema backend de reservas de poltronas para viagens de ônibus. Ele resolve um dos maiores desafios em sistemas de alta concorrência: **evitar que dois usuários reservem a mesma poltrona simultaneamente**.

Para isso, a API combina três tecnologias complementares:

| Tecnologia | Papel |
|---|---|
| **Redis** | Locks distribuídos para garantir exclusividade durante a reserva |
| **RabbitMQ** | Fila de mensagens para expirar reservas não pagas automaticamente |
| **PostgreSQL + Prisma** | Persistência com transações ACID para consistência dos dados |

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | 20 (Alpine) |
| Framework | NestJS | 11.0.1 |
| Linguagem | TypeScript | 5.7.3 |
| Banco de Dados | PostgreSQL | 15 |
| ORM | Prisma | 7.4.2 |
| Cache / Locks | Redis (ioredis) | 7 |
| Mensageria | RabbitMQ (amqplib) | 3.12 |
| Validação | class-validator / class-transformer | — |
| Testes | Jest | 30.0.0 |
| Linting | ESLint | 9.18 |
| Formatação | Prettier | 3.4.2 |
| Containerização | Docker / Docker Compose | — |

---

## ✨ Funcionalidades

- **Gerenciamento de Viagens**: Criação de viagens de ônibus com geração automática de poltronas numeradas.
- **Reserva de Poltronas**: Reserva de assento específico com janela de 30 segundos para pagamento.
- **Controle de Concorrência**: Lock distribuído via Redis impede reservas duplicadas simultâneas.
- **Expiração Automática**: Poltronas reservadas e não pagas são liberadas automaticamente via RabbitMQ.
- **Transações ACID**: Todas as operações críticas são executadas em transações do Prisma.
- **Validação de Entrada**: DTOs com `class-validator` garantem integridade dos dados recebidos.

---

## 🏗 Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        Cliente (HTTP)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    NestJS API (porta 3000)                   │
│                                                             │
│   ┌─────────────────┐       ┌──────────────────────────┐   │
│   │  TripsModule    │       │   ReservationsModule     │   │
│   │                 │       │                          │   │
│   │  POST /trips    │       │  POST /reservations      │   │
│   └────────┬────────┘       └────────────┬─────────────┘   │
│            │                             │                  │
│            ▼                             ▼                  │
│   ┌─────────────────────────────────────────────────────┐  │
│   │               PrismaService (PostgreSQL)            │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   ┌──────────────────┐     ┌──────────────────────────┐   │
│   │   RedisService   │     │     RabbitmqService      │   │
│   │  (Locks ~5s)     │     │  (Fila de expiração 30s) │   │
│   └──────────────────┘     └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
        │                           │                │
        ▼                           ▼                ▼
  ┌──────────┐            ┌──────────────┐   ┌──────────────┐
  │PostgreSQL│            │    Redis     │   │  RabbitMQ    │
  │  :5432   │            │    :6379     │   │  :5672/:15672│
  └──────────┘            └──────────────┘   └──────────────┘
```

### Fluxo de Reserva

```
Usuário faz POST /reservations
        │
        ▼
[Redis] Tenta adquirir lock lock:seat:{seatId} por 5s
        │
        ├── Lock negado → 409 Conflict (outro usuário está processando)
        │
        └── Lock adquirido
                │
                ▼
        [PostgreSQL] Inicia transação ACID
                │
                ├── Poltrona não encontrada → 400 Bad Request
                ├── Status ≠ AVAILABLE     → 409 Conflict
                │
                └── Cria Reservation (status: PENDING, expiresAt: +30s)
                    Atualiza Seat (status: RESERVED)
                        │
                        ▼
                [Redis] Libera lock
                        │
                        ▼
                [RabbitMQ] Envia reservationId para fila com TTL de 30s
                        │
                   (após 30 segundos)
                        ▼
                [RabbitMQ] Dead-letter exchange roteia mensagem
                        │
                        ▼
                [API] cancelUnpaidReservation()
                   Reservation.status == PENDING?
                        │
                        ├── Sim → Seat: AVAILABLE | Reservation: EXPIRED
                        └── Não → Reserva já paga, nenhuma ação necessária
```

---

## 📦 Pré-requisitos

- [Node.js](https://nodejs.org/) 20+
- [npm](https://www.npmjs.com/) 10+
- [Docker](https://www.docker.com/) e [Docker Compose](https://docs.docker.com/compose/) (para execução via containers)

> **Nota:** Sem Docker, você precisará instalar e configurar PostgreSQL, Redis e RabbitMQ localmente.

---

## 🚀 Instalação e Execução

### Opção 1 — Docker Compose (recomendado)

Sobe todos os serviços (API + PostgreSQL + Redis + RabbitMQ) com um único comando:

```bash
# Clonar o repositório
git clone https://github.com/cksalmeida/bookingtt-api.git
cd bookingtt-api

# Subir todos os containers
docker-compose up
```

A API ficará disponível em **http://localhost:3000**.  
A interface de gerenciamento do RabbitMQ estará em **http://localhost:15672**
(usuário: `bookingtt_user` / senha: `bookingtt_password`).

---

### Opção 2 — Desenvolvimento Local

**1. Instale as dependências**

```bash
npm install
```

**2. Configure as variáveis de ambiente**

Crie um arquivo `.env` na raiz do projeto com o conteúdo abaixo e ajuste conforme seu ambiente:

```env
PORT=3000
DATABASE_URL=postgresql://bookingtt_user:bookingtt_password@localhost:5432/bookingtt_db
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_URL=amqp://bookingtt_user:bookingtt_password@localhost:5672
```

**3. Execute as migrações do banco de dados**

```bash
npx prisma migrate deploy
```

**4. Inicie o servidor**

```bash
# Modo desenvolvimento (com hot-reload)
npm run start:dev

# Modo produção
npm run build
npm run start:prod
```

---

## 🔐 Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|---|---|---|
| `PORT` | Porta em que a API irá escutar | `3000` |
| `DATABASE_URL` | String de conexão do PostgreSQL (formato Prisma) | `postgresql://user:pass@host:5432/db` |
| `REDIS_HOST` | Endereço do servidor Redis | `localhost` |
| `REDIS_PORT` | Porta do servidor Redis | `6379` |
| `RABBITMQ_URL` | URL de conexão do RabbitMQ (protocolo AMQP) | `amqp://user:pass@host:5672` |

---

## 📡 Endpoints da API

### `GET /`

Verificação de saúde (health check) da API.

**Resposta `200 OK`**
```
Hello World!
```

---

### `POST /trips`

Cria uma nova viagem e gera automaticamente todas as poltronas numeradas.

**Body (JSON)**

| Campo | Tipo | Obrigatório | Regras | Descrição |
|---|---|---|---|---|
| `technicalTripId` | `string` | ✅ | não vazio | Identificador técnico externo da viagem |
| `bus` | `string` | ✅ | não vazio | Identificador ou placa do ônibus |
| `boardingTime` | `string` | ✅ | ISO 8601 | Data e hora do embarque |
| `price` | `number` | ✅ | ≥ 1 | Preço da passagem |
| `totalSeats` | `number` | ✅ | ≥ 10 | Quantidade de poltronas do ônibus |

**Exemplo de requisição**

```json
POST /trips
Content-Type: application/json

{
  "technicalTripId": "TT-2026-001",
  "bus": "ABC-1234",
  "boardingTime": "2026-06-15T08:00:00.000Z",
  "price": 75.90,
  "totalSeats": 40
}
```

**Resposta `201 Created`**

```json
{
  "message": "Viagem e poltronas criadas com sucesso!",
  "tripId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "totalSeatsCreated": 40
}
```

---

### `POST /reservations`

Reserva uma poltrona específica em uma viagem. Utiliza lock distribuído para evitar reservas duplicadas e enfileira a expiração automática após 30 segundos caso o pagamento não seja confirmado.

**Body (JSON)**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `userId` | `string` | ✅ | Identificador do usuário que está realizando a reserva |
| `tripId` | `string` | ✅ | ID da viagem (retornado pelo `POST /trips`) |
| `seatId` | `string` | ✅ | ID da poltrona a ser reservada |

**Exemplo de requisição**

```json
POST /reservations
Content-Type: application/json

{
  "userId": "user-uuid-aqui",
  "tripId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "seatId": "seat-uuid-aqui"
}
```

**Resposta `201 Created`**

```json
{
  "message": "Poltrona reservada com sucesso! Você tem 30 segundos para pagar.",
  "reservationId": "res-uuid-aqui",
  "expiresAt": "2026-06-15T08:00:30.000Z"
}
```

**Respostas de erro**

| Status | Motivo |
|---|---|
| `400 Bad Request` | `seatId` inválido ou poltrona não encontrada |
| `409 Conflict` | Poltrona já reservada/vendida, ou lock ativo por outro usuário |
| `422 Unprocessable Entity` | Campos obrigatórios ausentes ou com formato inválido |

---

## 🗄 Modelos de Dados

### Diagrama de Entidades

```
┌─────────────────────┐       ┌──────────────────────┐       ┌──────────────────────────┐
│        Trip         │       │         Seat         │       │       Reservation        │
├─────────────────────┤       ├──────────────────────┤       ├──────────────────────────┤
│ id (UUID, PK)       │◄──┐   │ id (UUID, PK)        │◄──┐   │ id (UUID, PK)            │
│ technicalTripId     │   └───│ tripId (FK → Trip)   │   └───│ seatId (FK → Seat)       │
│ bus                 │       │ number               │       │ userId                   │
│ boardingTime        │       │ status (SeatStatus)  │       │ tripId                   │
│ price (Decimal)     │       └──────────────────────┘       │ status (ReservationStatus│
│ createdAt           │                                       │ expiresAt                │
│ updatedAt           │                                       │ createdAt                │
└─────────────────────┘                                       │ updatedAt                │
                                                              └──────────────────────────┘
```

### Enums

**`SeatStatus`**

| Valor | Descrição |
|---|---|
| `AVAILABLE` | Poltrona disponível para reserva |
| `RESERVED` | Poltrona reservada (aguardando pagamento por até 30s) |
| `SOLD` | Poltrona vendida (pagamento confirmado) |

**`ReservationStatus`**

| Valor | Descrição |
|---|---|
| `PENDING` | Reserva criada, aguardando pagamento |
| `CONFIRMED` | Pagamento confirmado |
| `CANCELLED` | Cancelada manualmente |
| `EXPIRED` | Expirou por falta de pagamento no prazo |

---

## 🔩 Padrões Arquiteturais

### Lock Distribuído com Redis

Para evitar a reserva dupla de uma mesma poltrona por dois usuários simultâneos, a API adquire um lock no Redis antes de qualquer operação no banco:

- **Chave do lock:** `lock:seat:{seatId}`
- **Timeout do lock:** 5.000 ms
- O lock é **sempre liberado** no bloco `finally`, garantindo que nunca fique preso mesmo em caso de erro.

```
Usuário A ──► acquireLock("lock:seat:42") ──► OK  ──► processa reserva
Usuário B ──► acquireLock("lock:seat:42") ──► FAIL ──► 409 Conflict
```

### Transações ACID com Prisma

Toda operação de criação ou cancelamento de reserva é executada dentro de `prisma.$transaction()`. Isso garante que a atualização do status da poltrona e a criação/atualização da reserva ocorram **atomicamente** — ou ambas acontecem, ou nenhuma acontece.

### Expiração Automática via RabbitMQ

O mecanismo de expiração utiliza o padrão **Dead Letter Exchange (DLX)** do RabbitMQ:

1. Ao criar uma reserva, o `reservationId` é publicado em uma **fila de espera** com TTL de 30 segundos.
2. Após o TTL, a mensagem é redirecionada automaticamente pelo RabbitMQ para a **fila de processamento**.
3. O `ReservationsService` consome a fila de processamento e chama `cancelUnpaidReservation()`.
4. Se a reserva ainda estiver `PENDING`, a poltrona volta para `AVAILABLE` e a reserva é marcada como `EXPIRED`.

```
[Fila de Espera] ──(TTL 30s)──► [Dead Letter Exchange] ──► [Fila de Processamento]
                                                                     │
                                                          ReservationsService.cancelUnpaidReservation()
```

---

## 🧪 Testes

```bash
# Rodar todos os testes unitários
npm run test

# Rodar testes em modo watch (ideal para desenvolvimento)
npm run test:watch

# Gerar relatório de cobertura de testes
npm run test:cov

# Rodar testes end-to-end
npm run test:e2e

# Rodar testes com debugger
npm run test:debug
```

Os testes estão localizados ao lado dos arquivos de produção (padrão `*.spec.ts`) e na pasta `test/` para os testes E2E.

---

## 📁 Estrutura do Projeto

```
bookingtt-api/
├── src/
│   ├── main.ts                          # Bootstrap da aplicação e ValidationPipe
│   ├── app.module.ts                    # Módulo raiz — importa todos os módulos
│   ├── app.controller.ts                # GET / (health check)
│   ├── app.service.ts                   # Serviço raiz
│   │
│   ├── trips/                           # Módulo de viagens
│   │   ├── trips.module.ts
│   │   ├── trips.controller.ts          # POST /trips
│   │   ├── trips.service.ts             # Cria viagem + poltronas em transação ACID
│   │   ├── trips.controller.spec.ts
│   │   ├── trips.service.spec.ts
│   │   └── dto/
│   │       └── create-trip.dto.ts       # Validação dos dados de entrada
│   │
│   ├── reservations/                    # Módulo de reservas
│   │   ├── reservations.module.ts
│   │   ├── reservations.controller.ts   # POST /reservations
│   │   ├── reservations.service.ts      # Lock → Transação → RabbitMQ → Expiração
│   │   ├── reservations.controller.spec.ts
│   │   ├── reservations.service.spec.ts
│   │   └── dto/
│   │       └── create-reservation.dto.ts
│   │
│   ├── prisma/                          # Módulo do banco de dados
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts            # Inicializa e expõe o PrismaClient
│   │   └── prisma.service.spec.ts
│   │
│   ├── redis/                           # Módulo de cache e locks
│   │   ├── redis.module.ts
│   │   ├── redis.service.ts             # acquireLock / releaseLock
│   │   └── redis.service.spec.ts
│   │
│   └── rabbitmq/                        # Módulo de mensageria
│       ├── rabbitmq.module.ts
│       ├── rabbitmq.service.ts          # sendToWaitQueue / consumeExpiredReservations
│       └── rabbitmq.service.spec.ts
│
├── prisma/
│   ├── schema.prisma                    # Modelos Trip, Seat, Reservation e enums
│   ├── prisma.config.ts
│   └── migrations/                      # Histórico de migrações do banco
│
├── test/
│   └── jest-e2e.json                    # Configuração dos testes E2E
│
├── Dockerfile                           # Imagem Node.js 20 Alpine
├── docker-compose.yml                   # API + PostgreSQL + Redis + RabbitMQ
├── nest-cli.json
├── tsconfig.json
├── eslint.config.mjs
├── .prettierrc
└── package.json
```

---

## 📄 Licença

Este projeto está licenciado sob a licença **MIT**.
