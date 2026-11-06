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

**Operation**:
A named thing the platform does to files, such as `compress`, `resize`, or `merge`, named by what it does rather than by file type. Each has one option schema and a version (`resize@2`).
_Avoid_: Tool, endpoint, action, transform

**Job**:
One run of one operation on its inputs, from submission to its result files. Every operation runs as a job; usage and charges are recorded per job. A job's input can be an earlier job's result.
_Avoid_: Task, request (when meaning the unit of work), prediction

**Pipeline**:
An ordered set of steps submitted together, where later steps use earlier steps' results. Each step runs as its own job; a failed pipeline can be resumed without repeating finished steps.
_Avoid_: Chain, workflow, assembly

**Step**:
One operation inside a pipeline, with a name other steps can refer to.
_Avoid_: Task, stage

**Batch**:
One operation or pipeline applied to many inputs in one request. Each input becomes its own job or pipeline.
_Avoid_: Bulk job, group
