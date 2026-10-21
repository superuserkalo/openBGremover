# openBGremover

A media-processing platform for agents, developers, and people: one authenticated
API that modifies images, video, audio, and documents, reached through the
website, HTTP API, SDKs, CLI, and MCP.

## Language

### Media and encoding

**Format**:
The output file type a caller asks for, such as JPEG, AVIF, or MP4. Callers choose formats, never implementations.
_Avoid_: Codec (when meaning the caller's choice), file type

**Encoder**:
The implementation the platform selects to produce a format, such as MozJPEG for JPEG. Reported in results, never chosen by callers.
_Avoid_: Codec, engine, backend

**Option**:
A caller-settable control on how a task is performed, grouped under the format or step it affects. An omitted option takes the platform's default.
_Avoid_: Setting, parameter, flag

### Clients

**Client surface**:
One of the ways a caller reaches the platform: website, HTTP API, SDK, CLI, or MCP. Every surface exposes the same options.
_Avoid_: Channel, integration

### Accounts and work

**Workspace**:
The owner of jobs, usage, and API keys. Every user gets a personal workspace at signup; teams later share one.
_Avoid_: Project, team, organization, account (when meaning the owner of work)

**API key**:
A secret that lets a caller act for one workspace, limited by its preset (Full, Read-only, or Restricted) and optional spending and rate limits.
_Avoid_: Token (when meaning an API key), secret

**Job**:
One requested operation on one input, from submission to its result. Every operation runs as a job; usage and charges are recorded per job.
_Avoid_: Task, request (when meaning the unit of work), prediction
