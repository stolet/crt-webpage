(function(root) {
  'use strict';
  class Counter {
    constructor() { this.value = null; this.target = null; }
    set(target) { this.target = target; if (this.value === null) this.value = target; }
    advance(seconds) {
      if (this.target === null) return null;
      this.value += (this.target - this.value) * (1 - Math.exp(-Math.max(0, seconds) / .45));
      if (Math.abs(this.target - this.value) < .001) this.value = this.target;
      return this.value;
    }
  }
  root.TailMetricMotion = { Counter };
})(typeof window !== 'undefined' ? window : globalThis);
