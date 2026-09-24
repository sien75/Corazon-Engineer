# Corazon Engineer

[中文](README_zh.md)

An **engineering agent** on top of the coding agent. It describes a system — what it is made of, how the parts connect, and how they run — as a small, readable schema (atoms, edges, contracts, runtime), so a change can be designed, built, verified and operated above any single repository.

## How to use it

Download the tarball for your OS/arch from the [Releases page](https://github.com/sien75/Corazon-Engineer/releases), then unpack, install once, and run `corazon` in the directory of the project you want it to process:

```bash
tar xzf corazon-*.tar.gz && ./corazon-*/install.sh
corazon             # start all services in the foreground (Ctrl-C stops them)
corazon status      # per-service state for the current directory
```

Open the web address it prints and talk to the agent. The current working directory **is** the project — it may be empty, and the agent will initialize it; all data stays in that directory's `.corazon/`.

Upgrade is the same command (only the software is replaced, never the project's `.corazon/`); uninstall with `corazon uninstall [--purge]`. You can also run `./bin/corazon` straight from an unpacked tarball. The ai service reads its LLM provider key from pi's own config (env vars or `~/.pi/agent/auth.json`).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
