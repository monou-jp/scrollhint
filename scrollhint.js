/*! scrollhint.js - lightweight scroll section switcher (BSD-3-Clause) */
/*!
 * ScrollHint.js v0.1.0
 * Copyright (c) 2026 門王 (https://monou.jp)
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

(function (window, document) {
    'use strict';

    // ------------------------------
    // Defaults (can be overwritten by window.SCROLLHINT_CONFIG)
    // ------------------------------
    var DEFAULT_CONFIG = {
        // sections: Array | String (selector) | NodeList
        // If String/NodeList: auto-normalize with optional TOC binding
        sections: [],

        // fixed header offset
        offset: 0, // number or function(){ return number; }

        // active class applied to section itself (default)
        activeClass: 'is-active',

        // optional class applied to <html> for "enabled" styling
        rootClass: '',

        // Enter/active line position inside viewport:
        // 'top'|'center'|'bottom' or number(0..1) => 0=top, 0.5=center, 1=bottom
        enterAt: 'top',

        // When true, create applyTo automatically:
        // - if section has id => bind to `tocSelector a[href="#id"]`
        // - if section has data-scrollhint-toc => bind to that selector
        bindTOC: false,
        tocSelector: '', // e.g. '.toc' (used only when bindTOC=true)

        // Update callback called on scroll while active section stays same (throttled by rAF/throttle)
        // (default: disabled)
        onUpdate: null,

        // Performance
        useRAF: true,
        throttle: 50,

        // Direction
        detectDirection: true,

        // Optional: if true, refresh() also on DOMContentLoaded and after short delay
        // (helps for late-loading fonts/images in LPs)
        softRefresh: true,
        softRefreshDelay: 400,

        // Debug
        debug: false
    };

    // ------------------------------
    // Utilities (ES5)
    // ------------------------------
    function extend(target, src) {
        var k;
        if (!src) return target;
        for (k in src) if (src.hasOwnProperty(k)) target[k] = src[k];
        return target;
    }
    function isFn(v) { return typeof v === 'function'; }
    function isStr(v) { return typeof v === 'string'; }
    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    function toArray(list) {
        var arr = [];
        var i;
        if (!list) return arr;
        for (i = 0; i < list.length; i++) arr.push(list[i]);
        return arr;
    }

    function selectAll(selector) {
        try { return toArray(document.querySelectorAll(selector)); }
        catch (e) { return []; }
    }

    function addClass(el, cls) {
        if (!el || !cls) return;
        if (el.classList) el.classList.add(cls);
        else if ((' ' + el.className + ' ').indexOf(' ' + cls + ' ') === -1) el.className += ' ' + cls;
    }

    function removeClass(el, cls) {
        if (!el || !cls) return;
        if (el.classList) el.classList.remove(cls);
        else el.className = (' ' + el.className + ' ').replace(' ' + cls + ' ', ' ').replace(/^\s+|\s+$/g, '');
    }

    function now() { return (window.Date && Date.now) ? Date.now() : +new Date(); }

    function getOffset(cfg) {
        try { return isFn(cfg.offset) ? (cfg.offset() || 0) : (cfg.offset || 0); }
        catch (e) { return 0; }
    }

    function getViewportHeight() {
        return window.innerHeight || document.documentElement.clientHeight || 0;
    }

    function getEnterRatio(cfg) {
        var v = cfg.enterAt;
        if (isNum(v)) {
            if (v < 0) return 0;
            if (v > 1) return 1;
            return v;
        }
        if (v === 'center') return 0.5;
        if (v === 'bottom') return 1;
        return 0; // top
    }

    // ------------------------------
    // Normalization
    // ------------------------------
    function normalizeApplyTo(applyTo) {
        // ensure array of {selector|element, className}
        var out = [];
        var i, it;
        if (!applyTo) return out;
        for (i = 0; i < applyTo.length; i++) {
            it = applyTo[i];
            if (!it) continue;
            out.push({
                selector: it.selector,
                element: it.element,
                className: it.className
            });
        }
        return out;
    }

    function getSectionIdSelector(el) {
        if (!el) return '';
        if (el.id) return '#' + el.id;
        return '';
    }

    function buildAutoTOCApplyTo(cfg, sectionEl) {
        // Priority:
        // 1) data-scrollhint-toc on section => selector
        // 2) bindTOC + tocSelector + section id => `${tocSelector} a[href="#id"]`
        var applyTo = [];
        if (!sectionEl) return applyTo;

        var custom = sectionEl.getAttribute ? sectionEl.getAttribute('data-scrollhint-toc') : '';
        if (custom) {
            applyTo.push({ selector: custom, className: 'is-current' });
            return applyTo;
        }

        if (!cfg.bindTOC) return applyTo;
        if (!cfg.tocSelector) return applyTo;

        var idSel = getSectionIdSelector(sectionEl);
        if (!idSel) return applyTo;

        // Most common pattern: TOC link to hash
        applyTo.push({ selector: cfg.tocSelector + ' a[href="' + idSel + '"]', className: 'is-current' });
        return applyTo;
    }

    function normalizeSectionItem(cfg, item) {
        // item can be:
        // - {target, ...}
        // - Element (target itself)
        // - String selector (handled earlier)
        var targetEl = null;
        var applyTo = [];
        var enterClass;

        if (!item) return null;

        if (item.nodeType === 1) {
            targetEl = item;
            enterClass = cfg.activeClass;
            applyTo = buildAutoTOCApplyTo(cfg, targetEl);
            applyTo = normalizeApplyTo(applyTo);
            return {
                id: getSectionIdSelector(targetEl),
                target: targetEl,
                enterClass: enterClass,
                applyTo: applyTo,
                onEnter: null,
                onLeave: null,
                onUpdate: null,
                _active: false,
                _top: 0,
                _bottom: 0
            };
        }

        // object config
        if (item.target && item.target.nodeType === 1) {
            targetEl = item.target;
        } else if (isStr(item.target)) {
            try { targetEl = document.querySelector(item.target); } catch (e) { targetEl = null; }
        }

        if (!targetEl) return null;

        enterClass = item.enterClass || cfg.activeClass;

        // merge applyTo: item.applyTo + optional auto TOC
        applyTo = normalizeApplyTo(item.applyTo || []);
        if (cfg.bindTOC) {
            var auto = buildAutoTOCApplyTo(cfg, targetEl);
            auto = normalizeApplyTo(auto);
            // append only if not duplicate selector+class
            var i, j, dup;
            for (i = 0; i < auto.length; i++) {
                dup = false;
                for (j = 0; j < applyTo.length; j++) {
                    if (applyTo[j].selector && auto[i].selector &&
                        applyTo[j].selector === auto[i].selector &&
                        applyTo[j].className === auto[i].className) {
                        dup = true; break;
                    }
                }
                if (!dup) applyTo.push(auto[i]);
            }
        }

        return {
            id: item.id || getSectionIdSelector(targetEl),
            target: targetEl,
            enterClass: enterClass,
            applyTo: applyTo,
            onEnter: item.onEnter,
            onLeave: item.onLeave,
            onUpdate: item.onUpdate, // per-section update hook (optional)
            _active: false,
            _top: 0,
            _bottom: 0
        };
    }

    function normalizeSections(cfg) {
        // cfg.sections can be:
        // - Array of configs/elements
        // - selector string: ".js-section"
        // - NodeList
        var raw = cfg.sections;
        var items = [];
        var i;

        if (isStr(raw)) {
            items = selectAll(raw);
        } else if (raw && typeof raw.length === 'number' && !raw.push) {
            // NodeList/HTMLCollection
            items = toArray(raw);
        } else if (raw && raw.push) {
            items = raw;
        } else {
            items = [];
        }

        var out = [];
        var norm;
        for (i = 0; i < items.length; i++) {
            norm = normalizeSectionItem(cfg, items[i]);
            if (norm) out.push(norm);
        }
        return out;
    }

    // ------------------------------
    // Core
    // ------------------------------
    function ScrollHint(userOptions) {
        var cfg = {};
        extend(cfg, DEFAULT_CONFIG);
        extend(cfg, userOptions);
        if (window.SCROLLHINT_CONFIG) extend(cfg, window.SCROLLHINT_CONFIG);

        this.cfg = cfg;
        this.sections = [];
        this._activeIndex = -1;

        this._ticking = false;
        this._paused = false;

        this._lastY = this._getScrollY();
        this._dir = 'down';
        this._lastRun = 0;

        this._onScroll = this._onScroll.bind(this);
        this._onResize = this._onResize.bind(this);

        this._init();
    }

    ScrollHint.prototype._init = function () {
        var cfg = this.cfg;

        this.sections = normalizeSections(cfg);

        if (cfg.rootClass) addClass(document.documentElement, cfg.rootClass);

        this.refresh();
        this._bind();
        this._schedule(); // initial run

        // soft refresh for late layout changes (fonts/images)
        if (cfg.softRefresh) {
            var self = this;
            window.setTimeout(function () {
                if (self._paused) return;
                self.refresh();
                self._schedule();
            }, cfg.softRefreshDelay || 0);
        }
    };

    ScrollHint.prototype._bind = function () {
        window.addEventListener('scroll', this._onScroll, { passive: true });
        window.addEventListener('resize', this._onResize);
        window.addEventListener('orientationchange', this._onResize);
    };

    ScrollHint.prototype._unbind = function () {
        window.removeEventListener('scroll', this._onScroll);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('orientationchange', this._onResize);
    };

    ScrollHint.prototype._getScrollY = function () {
        return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    };

    ScrollHint.prototype._onScroll = function () {
        if (this._paused) return;

        if (this.cfg.detectDirection) {
            var y = this._getScrollY();
            this._dir = (y >= this._lastY) ? 'down' : 'up';
            this._lastY = y;
        }

        this._schedule();
    };

    ScrollHint.prototype._onResize = function () {
        if (this._paused) return;
        this.refresh();
        this._schedule();
    };

    ScrollHint.prototype._schedule = function () {
        var self = this;
        var cfg = this.cfg;

        if (cfg.useRAF && window.requestAnimationFrame) {
            if (this._ticking) return;
            this._ticking = true;
            window.requestAnimationFrame(function () {
                self._ticking = false;
                self._run();
            });
            return;
        }

        // throttle fallback
        var t = now();
        if (t - this._lastRun < (cfg.throttle || 0)) return;
        this._lastRun = t;
        this._run();
    };

    ScrollHint.prototype.refresh = function () {
        // cache section positions (document coords)
        var i, rect, top, bottom;
        var scrollY = this._getScrollY();

        for (i = 0; i < this.sections.length; i++) {
            rect = this.sections[i].target.getBoundingClientRect();
            top = rect.top + scrollY;
            bottom = rect.bottom + scrollY;
            this.sections[i]._top = top;
            this.sections[i]._bottom = bottom;
        }
    };

    ScrollHint.prototype._getLine = function () {
        var cfg = this.cfg;
        var offset = getOffset(cfg);
        var y = this._getScrollY();

        // enterAt controls where the line is inside viewport
        var ratio = getEnterRatio(cfg);
        var vh = getViewportHeight();
        // "line" in document coordinates:
        // y + offset + (vh * ratio)
        return y + offset + (vh * ratio);
    };

    ScrollHint.prototype._run = function () {
        var cfg = this.cfg;
        var line = this._getLine();

        var i, s, activeIndex = -1;

        for (i = 0; i < this.sections.length; i++) {
            s = this.sections[i];
            if (line >= s._top && line < s._bottom) {
                activeIndex = i;
                break;
            }
        }

        if (activeIndex === this._activeIndex) {
            // optional update hooks
            var current = (activeIndex >= 0) ? this.sections[activeIndex] : null;
            if (current) this._update(current, line);
            return;
        }

        var prev = (this._activeIndex >= 0) ? this.sections[this._activeIndex] : null;
        var next = (activeIndex >= 0) ? this.sections[activeIndex] : null;

        if (prev) this._deactivate(prev);
        if (next) this._activate(next);

        this._activeIndex = activeIndex;

        if (cfg.debug && window.console && console.log) {
            console.log('[scrollhint] active:', next ? next.id : '(none)', 'dir:', this._dir, 'line:', line);
        }
    };

    ScrollHint.prototype._applyTargets = function (applyTo, active) {
        var i, item, els, j, el, cls;

        for (i = 0; i < applyTo.length; i++) {
            item = applyTo[i];
            cls = item.className;
            if (!cls) continue;

            if (item.element && item.element.nodeType === 1) {
                el = item.element;
                if (active) addClass(el, cls);
                else removeClass(el, cls);
                continue;
            }

            if (item.selector && isStr(item.selector)) {
                els = selectAll(item.selector);
                for (j = 0; j < els.length; j++) {
                    if (active) addClass(els[j], cls);
                    else removeClass(els[j], cls);
                }
            }
        }
    };

    ScrollHint.prototype._ctx = function (s, line) {
        var y = this._getScrollY();
        return {
            section: s.target,
            id: s.id,
            direction: this._dir,
            scrollY: y,
            line: line,
            top: s._top,
            bottom: s._bottom,
            progress: (line - s._top) / Math.max(1, (s._bottom - s._top)) // 0..1-ish
        };
    };

    ScrollHint.prototype._activate = function (s) {
        s._active = true;
        addClass(s.target, s.enterClass);
        this._applyTargets(s.applyTo, true);

        if (isFn(s.onEnter)) s.onEnter(this._ctx(s, this._getLine()));
    };

    ScrollHint.prototype._deactivate = function (s) {
        s._active = false;
        removeClass(s.target, s.enterClass);
        this._applyTargets(s.applyTo, false);

        if (isFn(s.onLeave)) s.onLeave(this._ctx(s, this._getLine()));
    };

    ScrollHint.prototype._update = function (s, line) {
        // per-section onUpdate (optional) + global onUpdate (optional)
        var ctx = this._ctx(s, line);

        if (isFn(s.onUpdate)) s.onUpdate(ctx);
        if (isFn(this.cfg.onUpdate)) this.cfg.onUpdate(ctx);
    };

    // ------------------------------
    // Public instance methods
    // ------------------------------
    ScrollHint.prototype.destroy = function () {
        var cfg = this.cfg;

        this._unbind();

        // cleanup classes
        var i;
        for (i = 0; i < this.sections.length; i++) {
            this._deactivate(this.sections[i]);
        }
        this._activeIndex = -1;

        if (cfg.rootClass) removeClass(document.documentElement, cfg.rootClass);
    };

    ScrollHint.prototype.pause = function () { this._paused = true; };

    ScrollHint.prototype.resume = function () {
        this._paused = false;
        this.refresh();
        this._schedule();
    };

    ScrollHint.prototype.refreshNow = function () {
        this.refresh();
        this._schedule();
    };

    ScrollHint.prototype.getActive = function () {
        if (this._activeIndex < 0) return null;
        return this.sections[this._activeIndex] || null;
    };

    // ------------------------------
    // Public API
    // ------------------------------
    function scrollhint(options) {
        return new ScrollHint(options || {});
    }

    window.scrollhint = scrollhint;

})(window, document);
