import promotion from '../shared/offlineRound/promotion';
import ground from '../shared/offlineRound/ground';
import makeData from '../shared/offlineRound/data';
import sound from '../../sound';
import replayCtrl from '../shared/offlineRound/replayCtrl';
import storage from '../../storage';
import settings from '../../settings';
import actions from './actions';
import engine from './engine';
import helper from '../helper';
import { getRandomArbitrary } from '../../utils';
import m from 'mithril';

const storageKey = 'ai.current';
export const storageFenKey = 'ai.setupFen';

export default function controller() {

  helper.analyticsTrackView('Offline AI');

  const save = function() {
    storage.set(storageKey, {
      data: this.data,
      situations: this.replay.situations,
      ply: this.replay.ply
    });
  }.bind(this);

  const addMove = function(orig, dest, promotionRole) {
    this.replay.addMove(orig, dest, promotionRole);
    engine.addMove(orig, dest, promotionRole);
    this.data.game.fen = engine.getFen();
  }.bind(this);

  this.getOpponent = function() {
    const level = settings.ai.opponent();
    return {
      name: settings.ai.availableOpponents.filter(function(o) {
        return o[1] === level;
      })[0][0],
      level: parseInt(level) || 1
    };
  };

  const engineMove = function() {
    if (this.chessground.data.turnColor !== this.data.player.color) setTimeout(function() {
      engine.setLevel(this.getOpponent().level);
      engine.search(function(move) {
        this.chessground.apiMove(move[0], move[1]);
        addMove(move[0], move[1], move[2]);
      }.bind(this));
    }.bind(this), 500);
  }.bind(this);

  const onPromotion = function(orig, dest, role) {
    addMove(orig, dest, role);
  };

  const userMove = function(orig, dest) {
    if (!promotion.start(this, orig, dest, onPromotion)) {
      addMove(orig, dest);
    }
  }.bind(this);

  const onMove = function(orig, dest, capturedPiece) {
    if (!capturedPiece)
      sound.move();
    else
      sound.capture();
  };

  this.onReplayAdded = function() {
    m.startComputation();
    save();
    m.endComputation();
    if (this.replay.situation().finished) {
      this.chessground.cancelMove();
      this.chessground.stop();
      setTimeout(function() {
        this.actions.open();
        m.redraw();
      }.bind(this), 1000);
    } else engineMove();
  }.bind(this);

  this.actions = new actions.controller(this);

  this.init = function(data, situations, ply) {
    this.data = data;
    if (!this.chessground)
      this.chessground = ground.make(this.data, this.data.game.fen, userMove, onMove);
    else ground.reload(this.chessground, this.data, this.data.game.fen);
    if (!this.replay) this.replay = new replayCtrl(this, situations, ply);
    else this.replay.init(situations, ply);
    this.replay.apply();
    if (this.actions) this.actions.close();
    engine.init(this.data.game.fen);
    engineMove();
  }.bind(this);

  this.startNewGame = function() {
    const opts = {
      color: getColorFromSettings()
    };
    this.init(makeData(opts));
  }.bind(this);

  this.jump = function(ply) {
    this.chessground.cancelMove();
    if (this.replay.ply === ply || ply < 0 || ply >= this.replay.situations.length) return;
    this.replay.ply = ply;
    this.replay.apply();
    engine.init(this.replay.situation().fen);
  }.bind(this);

  this.forward = function() {
    this.jump(this.replay.ply + 2);
  }.bind(this);

  this.backward = function() {
    this.jump(this.replay.ply - 2);
  }.bind(this);

  this.firstPly = function () {
    return this.data.player.color === 'black' ? 1 : 0;
  }.bind(this);

  const saved = storage.get(storageKey);
  const setupFen = storage.get(storageFenKey);
  if (setupFen) {
    this.init(makeData({ fen: setupFen, color: getColorFromSettings() }));
    storage.remove(storageFenKey);
  } else if (saved) try {
    this.init(saved.data, saved.situations, saved.ply);
  } catch (e) {
    console.log(e, 'Fail to load saved game');
    this.init(makeData({}));
  } else this.init(makeData({}));

  window.plugins.insomnia.keepAwake();

  this.onunload = function() {
    window.plugins.insomnia.allowSleepAgain();
  };
}

function getColorFromSettings() {
  let color = settings.ai.color();
  if (color === 'random') {
    if (getRandomArbitrary(0, 2) > 1)
      color = 'white';
    else
      color = 'black';
  }

  return color;
}
