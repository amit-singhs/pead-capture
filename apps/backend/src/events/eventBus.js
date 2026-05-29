import { EventEmitter } from "node:events";

export class EventBus {
  #emitter = new EventEmitter();

  emit(type, payload) {
    this.#emitter.emit(type, payload);
    this.#emitter.emit("*", { type, payload });
  }

  on(type, listener) {
    this.#emitter.on(type, listener);
    return () => this.#emitter.off(type, listener);
  }
}
