/**
 * Un clic de liste envoie « menuId:optionId ». Le 2026-08-26, des parents de
 * MARCEL ARNAUD ont bouclé sur « Option non reconnue : "main:1" » parce que
 * l'identifiant n'était résolu que dans le menu COURANT : un bouton recliqué
 * plus haut dans le fil ne marchait plus. C'est le préfixe qui fait foi.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { targetMenuId, matchMenuOption, MENUS } from './menus.js';

test('un identifiant de liste désigne son menu d\'origine', () => {
  assert.equal(targetMenuId('main:2'), 'main');
  assert.equal(targetMenuId('finance:1'), 'finance');
  assert.equal(targetMenuId('account:4'), 'account');
  assert.equal(targetMenuId('pedagogy:8'), 'pedagogy');
});

test('une saisie ordinaire ne désigne aucun menu', () => {
  for (const saisie of ['1', '12', 'menu', 'bonjour', 'inconnu:1', '', null]) {
    assert.equal(targetMenuId(saisie), null, `saisie: ${JSON.stringify(saisie)}`);
  }
});

test('l\'option est retrouvée une fois le bon menu chargé', () => {
  const id = targetMenuId('finance:3');
  const option = matchMenuOption(MENUS[id], 'finance:3');
  assert.equal(option?.id, '3');
});

test('le menu courant ne reconnaît pas l\'identifiant d\'un autre menu', () => {
  // Comportement d'origine, conservé : c'est l'appelant qui doit charger le
  // menu désigné par le préfixe (via targetMenuId) avant de chercher l'option.
  assert.equal(matchMenuOption(MENUS.finance, 'main:1'), null);
});

test('le menu Compte propose l\'ajout d\'un second numéro', () => {
  const option = matchMenuOption(MENUS.account, 'account:4');
  assert.equal(option?.action, 'goto:addnumber');
});
