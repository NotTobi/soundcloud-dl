import { Logger } from "./logger";

export interface ObserverEvent {
  name?: string;
  selector: string;
  callback: (node: Element) => void;
}

export class DomObserver {
  private observer: MutationObserver;
  private events: ObserverEvent[] = [];
  private unqiueNodeId: number = 0;
  private logger: Logger;

  constructor() {
    this.observer = new MutationObserver((mutations) => mutations.forEach((mutation) => this.handleMutation(mutation)));
    this.logger = Logger.create("Observer");
  }

  start(node: Node) {
    this.observer.observe(node, { subtree: true, attributes: true, childList: true });

    this.logger.logDebug("Started");
  }

  stop() {
    this.observer.disconnect();

    this.logger.logDebug("Stopped");
  }

  addEvent(event: ObserverEvent) {
    if (!event.selector) {
      this.logger.logWarn("Selector was not specified");

      return;
    }

    if (!event.callback) {
      this.logger.logWarn("Callback was not specified");

      return;
    }

    this.events.push(event);

    this.logger.logDebug("Event added", event);
  }

  removeEvent(name: string) {
    this.events = this.events.filter((event) => event.name !== name);
  }

  private handleMutation(mutation: MutationRecord) {
    const target = mutation.target;
    const newNodes = mutation.addedNodes ?? [];

    for (const event of this.events) {
      if (newNodes.length > 0) {
        this.handleNodes(newNodes, event);
      } else if (mutation.type === "attributes") {
        this.handleNodes([target], event, false);
      }
    }
  }

  private handleNodes(nodes: any[] | NodeList, event: ObserverEvent, recursive: boolean = true) {
    if (!nodes) return;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (this.matchesSelectors(node, event.selector)) {
        // We only want to emmit an event once
        if (node._id !== undefined) return;

        node._id = ++this.unqiueNodeId;
        event.callback(node);
      }

      if (recursive && node.childNodes?.length > 0) this.handleNodes(node.childNodes, event);
    }
  }

  private matchesSelectors(element: any, selectors: string) {
    return element && element instanceof HTMLElement && element.matches(selectors);
  }
}
