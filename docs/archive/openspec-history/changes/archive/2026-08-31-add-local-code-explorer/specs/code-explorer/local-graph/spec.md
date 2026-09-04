## Purpose

Defines a small visual map around the currently focused symbol without expanding into a whole-project code diagram.

## ADDED Requirements

### Requirement: The graph contains one focus and loaded one-hop relations
The graph SHALL contain the current focused symbol and only project-local relation results that the user explicitly loaded from that view. It SHALL NOT preload, infer, or recursively expand additional nodes. A node SHALL appear at most once for one normalized symbol identity.

#### Scenario: Focus has no loaded relations
- **WHEN** a new symbol becomes focused before any relation group is opened
- **THEN** the graph contains only the focused symbol

#### Scenario: One relation group loads
- **WHEN** the user loads a bounded project-local relation group
- **THEN** the graph adds only those returned local symbols and their direct edges to the focus

#### Scenario: Loaded relation points beyond one hop
- **WHEN** one returned symbol has other known relations that the user has not navigated to
- **THEN** the graph does not add those second-hop symbols or edges

#### Scenario: Duplicate identity arrives through two relations
- **WHEN** two loaded relation groups contain the same normalized symbol identity
- **THEN** one node is rendered with both supported direct relation edges

### Requirement: Graph edges retain honest semantic labels
Every edge SHALL use the relation and semantic source returned by the shared service. Definition, reference, caller, callee, type, and implementation SHALL remain distinct. The graph SHALL NOT turn a reference into a call or display structural discovery as a semantic edge.

#### Scenario: Reference has no call-hierarchy evidence
- **WHEN** a loaded reference is not also returned as a caller or callee
- **THEN** its edge is labeled reference and no call direction is shown

#### Scenario: Caller and definition target the same symbol
- **WHEN** one node has two proven relations to the focus
- **THEN** the graph retains both distinct semantic edge labels

#### Scenario: Relation is discovery-only
- **WHEN** a candidate is labeled `discovery_only`
- **THEN** it does not appear as a semantic graph edge

### Requirement: Relation direction is visually stable
The focused node SHALL remain at the 50 percent horizontal lane. Incoming callers and references SHALL occupy the 16 percent lane. Outgoing callees, definitions, types, and implementations SHALL occupy the 84 percent lane. Within each side, relation groups SHALL use the declared relation order above and nodes within one group SHALL use service order at fixed 48 CSS pixel row spacing. The graph SHALL be vertically scrollable rather than move or hide returned nodes.

#### Scenario: Incoming and outgoing relations are loaded
- **WHEN** the graph contains at least one incoming and one outgoing relation
- **THEN** they appear on their declared sides of the centered focus with their semantic direction preserved

#### Scenario: Graph rerenders without state changes
- **WHEN** the same view and loaded relation data render again at the same viewport size
- **THEN** node order, edge direction, and group placement remain unchanged

### Requirement: Graph growth remains visibly bounded
The graph SHALL render no more relation nodes or edges than the bounded results already returned for the current view. The six groups SHALL each retain the shared maximum of 200 returned relations, so one view SHALL derive at most 1,201 nodes including focus and 1,200 returned relation edges before identity deduplication. The browser SHALL issue zero graph-specific service requests. When a relation response reports omitted candidates, the graph SHALL show that the group is incomplete and SHALL NOT create placeholder nodes for omitted identities.

#### Scenario: Relation response is truncated
- **WHEN** a loaded group contains bounded results and a positive omitted count
- **THEN** the graph renders only returned nodes and shows the omitted count for that relation

#### Scenario: Several bounded groups are loaded
- **WHEN** the user loads more than one relation group
- **THEN** the graph contains the union of returned one-hop identities without recursive expansion

### Requirement: Selecting a graph node recenters through normal navigation
A project-local graph node SHALL be mouse-selectable. Selecting it SHALL request normal focus navigation, append one history position, and rebuild the graph around the new focus only after focus succeeds. External, unavailable, or omitted results SHALL not be selectable graph nodes.

#### Scenario: User selects a local graph node
- **WHEN** a rendered project-local relation node is clicked
- **THEN** it becomes the focused symbol, the prior center remains available through Back, and the graph resets to the new one-hop view

#### Scenario: Graph focus request fails
- **WHEN** a selected node cannot be focused at the current generation
- **THEN** the existing center and graph remain visible and no history position is added

#### Scenario: External result is loaded
- **WHEN** a relation group contains an external dependency result
- **THEN** the result remains in the relation list but does not become a selectable graph node

### Requirement: Stale and restored views keep recorded graph state
The graph SHALL be bound to the owning focus view and its project generation. A stale view MAY display its recorded graph as stale and SHALL disable node navigation. Back or Forward SHALL restore the graph data recorded for that view without rerunning relation requests.

#### Scenario: Project generation advances
- **WHEN** the current graph's view becomes stale
- **THEN** the graph remains visible with a stale label and none of its nodes can navigate

#### Scenario: History restores an older view
- **WHEN** Back restores a view with previously loaded graph relations
- **THEN** the recorded nodes, edges, omitted counts, and stale state reappear without eager relation loading

### Requirement: Graph rendering failure does not remove source navigation
The SVG graph SHALL be a derived presentation of current view data. A graph layout or rendering failure SHALL show a local `graph_render_failed` state while preserving the focused source, search, relation lists, and history controls.

#### Scenario: Graph renderer rejects malformed local state
- **WHEN** graph presentation data fails its client-side validation
- **THEN** only the graph area reports `graph_render_failed` and the source and list navigation remain usable

#### Scenario: Graph area is collapsed
- **WHEN** the user collapses the graph area
- **THEN** the focused source and relation lists remain available and no navigation state is discarded
