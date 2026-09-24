# Above the Coding Agent, What Is Still Missing? — Exploring the Engineering Agent

> From Coding Agent to Engineering Agent: an attempt at system-level engineering abstraction  
> Corazon Engineer prototype design and practice

## 1. AI Can Write Code — Is the Engineering Problem Solved?

Coding Agents are making code generation cheaper and cheaper, but finishing a real requirement still follows a longer chain:

```text
understand the system → decide where to change → design the change → coding → repeated verification → various system operations → production operations
```

Coding is only one link in that chain. In practice, using a Coding Agent makes it increasingly clear: code can be generated faster, but understanding the system, constraining changes, and judging whether a result is correct remain expensive.

This is the starting point of this exploration:

> **AI makes code generation cheaper and cheaper, but system understanding, constraint, and verification have not become cheaper in step.**

So perhaps what we lack is not another stronger Coding Agent, but a layer above the Coding Agent.

## 2. A Higher-Dimensional Abstraction: From a Single Repository to a Software Engineering Map

A system usually contains multiple frontend, backend, infrastructure, and tooling repositories; different systems also depend on one another through interfaces, messages, data, and deployment environments.

At the same time, code, interface documentation, development SOPs, monitoring logs, and test results are often scattered across different platforms, making it hard to see the full engineering context from one place.

So understanding a single repository in isolation is not enough. We need to organize this scattered information together:

```text
multiple code repositories within one system
+ relationships between repositories and services
+ actual runtime state in each environment
+ development, test, and verification results
= a software engineering map
```

This map does not replace the code repositories; it is built on top of them, connecting the engineering objects that were originally scattered everywhere. People and AI can first understand the system as a whole and design a plan, then hand implementation to the AI, and then verify.

## ~ A Small Question

Programming = data structures + algorithms.

In the AI era, which one matters more?

## 3. Key Design Ideas

In Corazon Engineer, the smallest engineering unit is called an **Atom**, the relationship between units is called an **Edge**, and a Schema describes their structure, contracts, and runtime environment.

For example, in a trading system, any of the following objects can be an Atom:

- `checkout-web`: the frontend application where users place orders.
- `order-service`: the backend service that creates and manages orders.
- `payment-gateway`: the gateway that connects to external payment channels.
- `order-db`: the database that stores order data.
- `order-events`: the message queue that carries order events.
- `settlement-worker`: the background job that performs reconciliation or settlement.

These Atoms may come from different code repositories, and may also be infrastructure software such as databases and message queues. Edges then connect relationships such as "the frontend calls the order service," "the order service writes to the database," and "order events trigger the settlement job," forming a complete system view.

How each Atom is coded internally is still left to the Coding Agent; Corazon Engineer is responsible for organizing the relationships between Atoms, so that system-level structure, operation, and verification can be understood uniformly.

### 3.1 Atom: Treat a Code Project as an Atom, Without Getting Involved in Writing Its Code

Corazon Engineer does not try to understand or take over the full implementation inside each project. Whether an Atom uses Java, Go, or TypeScript internally is not the first concern of the macro layer.

The macro layer only describes who this unit is, what capabilities it provides, what capabilities it depends on, and what relationships it has with other units. This preserves the boundary the Coding Agent is good at, while establishing a cross-project system perspective.

An Atom's Schema looks roughly like this:

```yaml
atoms:
  - name: order-service
    description: create and manage orders
    repo: git@github.com:example/order-service.git
    path: ./workspace/order-service
    runtime_type: go
    runtime_version: "1.22"
    role: service

    interfaces:
      provides:
        - id: create-order-api
          channel: network
          protocol: http
          contract: ./contracts/create-order-api.yaml
          extend:
            path: /orders
            method: POST

      consumes:
        - id: payment-api
          channel: network
          protocol: http
          contract: ./contracts/payment-api.yaml
```

This Schema mainly answers four kinds of questions:

- `name`, `description`, `repo`, `path`, `runtime_type`, `runtime_version`: basic information.
- `role`: what kind of engineering unit it is.
- `interfaces.provides`: what capabilities it provides to the system.
- `interfaces.consumes`: what capabilities in the system it depends on.

Interfaces describe the communication method and input/output constraints through `channel`, `protocol`, and `contract`, with protocol-specific information placed in `extend`. Concrete listen addresses and ports belong to the deployment environment, are described by Runtime, and are not written into the Atom.

### 3.2 Separating Static Structure from Runtime

A system's design structure, environment mapping, and what actually happens are not the same kind of information:

```text
Static:  what the system should be made of, and how the parts relate to each other
Runtime: what results these Atoms produce running in some environment, how to connect and observe them
```

Here Runtime is an **environment mapping**. The same set of Atoms and Edges can be mapped to development, staging, and production environments separately.

A minimal Runtime Schema looks roughly like this:

```yaml
runtime:
  dev:
    description: local development environment
    endpoints:
      - id: checkout-web
        channel: network
        protocol: http
        address: http://localhost:3000
      - id: order-service
        channel: network
        protocol: http
        address: http://localhost:8080
      - id: order-db
        channel: network
        protocol: pgwire
        address: postgres://localhost:5432/orders

    telemetry:
      - id: order-service
        backend: otel
        address: http://localhost:4317

    tests:
      - id: create-order-flow
        atoms: [checkout-web, order-service, order-db]
        case: ./tests/create-order-flow.md
```

Runtime mainly describes three kinds of information:

- `endpoints`: the connection address of each Atom in the current environment.
- `telemetry`: where to observe logs, metrics, and traces.
- `tests`: which system-level verifications this environment can run.

Runtime is not responsible for starting or deploying Atoms; it only describes how an existing environment connects to Corazon Engineer. Concrete services are brought up by the existing development and deployment systems; Corazon Engineer connects to, observes, and verifies them according to Runtime.

### 3.3 Read Directly, Change Through AI

When a person views the system, the interface should read the real structure and runtime data directly, without having the AI retell it.

But when a person wants to change the system, they no longer edit the Schema directly; instead they first express their intent to the AI:

```
                    ┌──────────────────────────────────────────────┐
                    │                web (frontend)                │
                    └───────┬──────────────┬───────────────┬───────┘
                            │              │               │
                          read       change / talk        read
                            │              │               │
                            ▼              ▼               ▼

        ┌──────────────┐          ┌───────────────┐        ┌──────────────┐
        │    static    │◄────────►│ ai orchestrate│◄──────►│     log      │
        └──────────────┘  write/  └──────┬────────┘ write/ └──────────────┘
                          query          │         query          ▲
                                         │ call                   │
                                         ▼                        │ write logs
                                  ┌───────────────┐               │ in real time
                                  │      CLI      │───────────────┘
                                  │ ext endpoints │
                                  │  / query src  │
                                  └───────────────┘
```

While calling external endpoints and querying data sources, the CLI writes logs into the Log store's tables in real time. Here the value of AI is not to replace query interfaces, but to translate human intent into constrained, approvable, and traceable system operations.

## 4. Conclusion and Open Questions

This prototype has verified, at this stage, that building a macro engineering layer above the Coding Agent is at least feasible in terms of model and interaction; a Schema can do more than draw diagrams — it can become the basis for querying, operating, and verifying a system.

But it has not yet proven that this abstraction can cover real engineering, nor that the benefit of maintaining this Schema layer necessarily outweighs its cost. For now, the Engineering Agent is more like an answer open for discussion and further experimentation, rather than a settled standard answer.

This is also the part I most want to discuss at the end of the sharing. Whether the Engineering Agent is correct is still uncertain, but the proposition behind it deserves continued verification:

> **As AI coding continues to advance, human attention may gradually move up from code generation to system structure, constraints, runtime results, and verification. Do we need to design new engineering tools for this layer?**
