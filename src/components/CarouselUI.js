import { Observable, Subject } from 'rxjs/Rx';
import anime from 'animejs';
import { enablePassiveEventListeners } from '../utils/event';
import { outerWidth } from '../utils/dom';

export default class CarouselUI {
  /**
   * @param selector
   */
  constructor(selector, options = {}) {
    this.subject = new Subject();
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

    // 各イベントをObservableに変換する
    const pointerdown$ = Observable.merge(
      Observable.fromEvent(this.el, 'touchstart', options),
      Observable.fromEvent(this.el, 'mousedown', options)
    );
    const pointermove$ = Observable.merge(
      Observable.fromEvent(this.el, 'touchmove', options),
      Observable.fromEvent(this.el, 'mousemove', options)
    );
    const pointerend$ = Observable.merge(
      Observable.fromEvent(document.body, 'touchend', options),
      Observable.fromEvent(document.body, 'mouseup', options)
    );

    // pointerdown$, pointermove$, pointerend$を利用して
    // ドラッグ中に、「引数のオブジェクトに移動距離をマージする」コールバック関数をemitするObservableを生成する
    const dragging$ = pointerdown$
      // `mergeMap`メソッドで、pointerdown中からpointerupするまでのポインタの移動距離をemitするObservableを生成する
      .mergeMap(start =>
        // `takeUntil`メソッドで、pointerend$がemitされるまで値をemitするObservableに変換
        // `map`メソッドでスタート地点からポインタの移動距離をemitするObservableに変換
        pointermove$
          .takeUntil(pointerend$)
          .map(move => move.pageX - start.pageX)
      )
      // 「移動距離を引数のオブジェクトにマージする」コールバック関数をemitするObservableを生成する
      .map(deltaX => state => Object.assign({}, state, { deltaX }));

    // dragging$, pointerend$を利用して
    // ドラッグ終了後のindexを返すコールバック関数をemitするObservableを生成する
    const dragend$ = dragging$
      // pointerend$.take(1)にすることで
      // switchMapが再び実行されるまで、pointerupイベントが何回発生しても
      // イベントはemitされなくなる
      .switchMap(() => pointerend$.take(1))
      // dragging$ Observableから最後にemitされた値（今回はコールバック関数）を取得
      .withLatestFrom(dragging$)
      // dragging$ Observableからemitされたコールバック関数を引数にして
      // indexを返すコールバック関数をemitするObservableを生成する
      .map(([, fn]) => state => {
        const { deltaX } = fn();

        let index;

        if (deltaX < -50) {
          index = state.index < this.maxCount ? state.index + 1 : 0;
        } else if (deltaX > 50) {
          index = state.index > 0 ? state.index - 1 : this.maxCount;
        } else {
          index = state.index;
        }

        return Object.assign({}, state, { index, deltaX: 0 });
      });

    /**
     * NEXTボタンををクリック時、インデックスを更新し、更新したindexを返すコールバック関数をemitするObservable
     */
    const next$ = Observable.fromEvent(this.elNext, 'click').map(() => state =>
      Object.assign({}, state, {
        index: state.index < this.maxCount ? state.index + 1 : 0,
      })
    );

    /**
     * PREVボタンををクリック時、インデックスを更新し、更新したindexを返すコールバック関数をemitするObservable
     */
    const prev$ = Observable.fromEvent(this.elPrev, 'click').map(() => state =>
      Object.assign({}, state, {
        index: state.index > 0 ? state.index - 1 : this.maxCount,
      })
    );

    /**
     * 読み込み完了時、ウィンドウサイズ変更時にスライドのwidthを更新し、
     * 更新したwidthを返すコールバック関数をemitするObservable
     */
    const update$ = Observable.merge(
      Observable.fromEvent(window, 'load'),
      Observable.fromEvent(window, 'resize')
    ).map(() => state =>
      Object.assign({}, state, { unitWidth: outerWidth(this.elItems[0]) })
    );

    /**
     * インディケータをクリック時、クリックしたインディケータのインデックスを返すコールバック関数をemitするObservable
     */
    const indication$ = Observable.fromEvent(this.elDots, 'click').map(
      el => state =>
        Object.assign({}, state, {
          index: parseInt(el.target.dataset.index, 10),
        })
    );

    const mousenter$ = Observable.fromEvent(this.el, 'mouseenter', options);
    const mouseleave$ = Observable.fromEvent(this.el, 'mouseleave', options);
    const mousenterd$ = mousenter$
      .mapTo(true)
      .merge(mouseleave$.mapTo(false))
      .startWith(false);
    const goto$ = this.subject
      .combineLatest(mousenterd$)
      .filter(([, mousenterd]) => !mousenterd);
    const timer$ = Observable.merge(mouseleave$, goto$)
      .startWith(true)
      .switchMap(() =>
        Observable.timer(3000).takeUntil(
          Observable.merge(
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
      .map(() => state =>
        Object.assign({}, state, {
          index: state.index < this.maxCount ? state.index + 1 : 0,
        })
      );

    Observable.merge(
      prev$,
      next$,
      update$,
      dragging$,
      dragend$,
      indication$,
      timer$
    )
      // state の初期値は`{ deltaX: 0, index: 0, unitWidth: outerWidth(this.elItems[0] }`
      // `changeFn`には各Observableからemitされたコールバック関数が参照される
      .scan((state, changeFn) => changeFn(state), {
        deltaX: 0,
        index: 0,
        unitWidth: outerWidth(this.elItems[0]),
      })
      .subscribe(({ deltaX, index, unitWidth }) => {
        const optionsForGoto =
          deltaX !== 0
            ? {
                el: this.elWrapper,
                translateX: -unitWidth * index,
                offset: deltaX,
                duration: 0,
              }
            : { el: this.elWrapper, translateX: -unitWidth * index };

        this.goTo(optionsForGoto).then(() => this.subject.next());
        this.updateDots(this.elDots, index);
      });
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
