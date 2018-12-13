import { Subject, fromEvent, merge, timer } from 'rxjs';
import {
  combineLatest,
  filter,
  map,
  mapTo,
  mergeMap,
  take,
  takeUntil,
  scan,
  startWith,
  switchMap,
  withLatestFrom,
} from 'rxjs/operators';
import anime from 'animejs';
import { enablePassiveEventListeners } from '../utils/event';
import { outerWidth } from '../utils/dom';
import { isMobile } from '../utils/userAgent';

const nextIndex = (index, max) => (index < max ? index + 1 : 0);
const prevIndex = (index, max) => (index > 0 ? index - 1 : max);

export default class CarouselUI {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector);
    this.elWrapper = this.el.querySelector(`${selector}_wrapper`);
    this.elItems = this.el.querySelectorAll(`${selector}_item`);
    this.elPrev = this.el.querySelector(`${selector}_previous`);
    this.elNext = this.el.querySelector(`${selector}_next`);
    this.elDots = this.el.querySelectorAll(`${selector}_dot`);

    this.maxCount = this.elItems.length - 1;
    this.options = options;

    this.bind();
  }

  bind() {
    const options = enablePassiveEventListeners() ? { passive: true } : false;

    const pointerdown$ = fromEvent(
      this.el,
      isMobile ? 'touchstart' : 'mousedown',
      options
    );
    const pointermove$ = fromEvent(
      this.el,
      isMobile ? 'touchmove' : 'mousemove',
      options
    );
    const pointerend$ = fromEvent(
      this.el,
      isMobile ? 'touchend' : 'mouseup',
      options
    );
    const dragging$ = pointerdown$.pipe(
      mergeMap(start =>
        pointermove$.pipe(
          takeUntil(pointerend$),
          map(move => move.pageX - start.pageX)
        )
      ),
      map(moveDistance => state => {
        return { ...state, moveDistance };
      })
    );

    const dragend$ = dragging$.pipe(
      switchMap(() => pointerend$.pipe(take(1))),
      withLatestFrom(dragging$),
      map(([, getState]) => state => {
        const { moveDistance } = getState();

        let index = state.index;
        if (moveDistance < -50) index = nextIndex(index, this.maxCount);
        if (moveDistance > 50) index = prevIndex(index, this.maxCount);

        return { ...state, index, moveDistance: 0 };
      })
    );

    /**
     * NEXTボタンをクリック時、インデックスを更新し、更新したindexを返すコールバック関数をemitするObservable
     */
    const next$ = fromEvent(this.elNext, 'click').pipe(
      map(() => state => {
        return {
          ...state,
          index: nextIndex(state.index, this.maxCount),
        };
      })
    );

    /**
     * PREVボタンををクリック時、インデックスを更新し、更新したindexを返すコールバック関数をemitするObservable
     */
    const prev$ = fromEvent(this.elPrev, 'click').pipe(
      map(() => state => {
        return {
          ...state,
          index: prevIndex(state.index, this.maxCount),
        };
      })
    );

    /**
     * 読み込み完了時、ウィンドウサイズ変更時にスライドのwidthを更新し、
     * 更新したwidthを返すコールバック関数をemitするObservable
     */
    const update$ = merge(
      fromEvent(window, 'load'),
      fromEvent(window, 'resize')
    ).pipe(
      map(() => state => {
        return { ...state, unitWidth: outerWidth(this.elItems[0]) };
      })
    );

    /**
     * インディケータをクリック時、クリックしたインディケータのインデックスを返すコールバック関数をemitするObservable
     */
    const indication$ = fromEvent(this.elDots, 'click').pipe(
      map(el => state => {
        return { ...state, index: parseInt(el.target.dataset.index, 10) };
      })
    );

    const mousenter$ = fromEvent(this.el, 'mouseenter', options);
    const mouseleave$ = fromEvent(this.el, 'mouseleave', options);
    const stay$ = merge(
      mousenter$.pipe(mapTo(true)),
      mouseleave$.pipe(mapTo(false))
    ).pipe(startWith(false));

    const subject = new Subject();
    const goto$ = subject.pipe(
      combineLatest(stay$),
      filter(([, mousenterd]) => !mousenterd)
    );

    const timer$ = merge(mouseleave$, goto$).pipe(
      startWith(true),
      switchMap(() =>
        timer(3000).pipe(
          takeUntil(
            merge(
              mousenter$,
              next$,
              prev$,
              update$,
              dragging$,
              dragend$,
              indication$
            )
          )
        )
      ),
      map(() => state => {
        return {
          ...state,
          index: state.index < this.maxCount ? state.index + 1 : 0,
        };
      })
    );

    merge(prev$, next$, update$, dragging$, dragend$, indication$, timer$)
      .pipe(
        // state の初期値は`{ moveDistance: 0, index: 0, unitWidth: outerWidth(this.elItems[0] }`
        // `changeFn`には各Observableからemitされたコールバック関数が参照される
        scan((state, changeFn) => changeFn(state), {
          moveDistance: 0,
          index: 0,
          unitWidth: outerWidth(this.elItems[0]),
        })
      )
      .subscribe(({ moveDistance, index, unitWidth }) => {
        this.goTo(
          this.getOptionsForGoto({
            moveDistance,
            index,
            unitWidth,
          })
        ).then(() => subject.next());
        this.updateDots(this.elDots, index);
      });
  }

  /**
   * カルーセルのスライドを制御するオプションを取得する
   * @param {number} moveDistance
   * @param {number} index
   * @param {number} unitWidth
   */
  getOptionsForGoto({ moveDistance, index, unitWidth }) {
    return moveDistance !== 0
      ? {
          el: this.elWrapper,
          translateX: -unitWidth * index,
          offset: moveDistance,
          duration: 0,
        }
      : { el: this.elWrapper, translateX: -unitWidth * index };
  }

  /**
   * カルーセルをスライドする
   * @param {*} el
   * @param {*} translateX
   * @param {*} offset
   * @param {*} easing
   * @param {*} duration
   */
  goTo({
    el,
    translateX,
    offset = 0,
    easing = (this.options.easing && this.options.easing) || 'easeOutQuad',
    duration = (this.options.duration && this.options.duration) || 300,
  }) {
    anime.remove(el);

    return anime({
      targets: el,
      translateX: translateX + offset,
      easing: easing,
      duration: duration,
    }).finished;
  }

  /**
   * インディケータのViewを更新する
   * @param {*} elDots
   * @param {*} index
   */
  updateDots(elDots, index) {
    [...elDots].forEach((elDot, dotIndex) => {
      dotIndex === index
        ? elDot.classList.add('is-active')
        : elDot.classList.remove('is-active');
    });
  }
}
