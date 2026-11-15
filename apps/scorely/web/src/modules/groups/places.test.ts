import { addressLine, coordsFromLink, routeUrl } from '@scorely/web/src/modules/groups/places';
import { describe, expect, it } from 'vitest';

// GRP-60: o ponto no mapa vem de um link do Google Maps colado (o completo, com as coordenadas).
// GRP-63: quem vê o jogo vê o endereço e o "Ver rota".

const POINT = { lat: -23.5614, lng: -46.6559 };

describe('lugares › ponto pelo link colado (GRP-60)', () => {
  it('GRP-60: link com @lat,lng (o /place/... do Maps) → o ponto', () => {
    expect(
      coordsFromLink('https://www.google.com/maps/place/Quadra+do+Clube/@-23.5614,-46.6559,17z'),
    ).toEqual(POINT);
  });

  it('GRP-60: link com ?q=lat,lng → o ponto', () => {
    expect(coordsFromLink('https://maps.google.com/?q=-23.5614,-46.6559')).toEqual(POINT);
  });

  it('GRP-60: link com ll=lat,lng → o ponto', () => {
    expect(coordsFromLink('https://maps.google.com/maps?ll=-23.5614,-46.6559&z=15')).toEqual(POINT);
  });

  it('GRP-60: link só com !3d<lat>!4d<lng> → o ponto', () => {
    expect(
      coordsFromLink(
        'https://www.google.com/maps/place/Quadra/data=!4m6!3m5!1s0x0:0x0!8m2!3d-23.5614!4d-46.6559',
      ),
    ).toEqual(POINT);
  });

  it('GRP-60: coordenadas soltas ("-23.5614, -46.6559") → o ponto', () => {
    expect(coordsFromLink('-23.5614, -46.6559')).toEqual(POINT);
  });

  it('GRP-60: link curto (maps.app.goo.gl) não traz o ponto → undefined', () => {
    expect(coordsFromLink('https://maps.app.goo.gl/AbCdEf123')).toBeUndefined();
  });

  it('GRP-60: texto sem coordenadas → undefined', () => {
    expect(coordsFromLink('Rua das Palmeiras, 10')).toBeUndefined();
    expect(coordsFromLink('')).toBeUndefined();
  });
});

describe('lugares › rota e endereço (GRP-63)', () => {
  it('GRP-63: "Ver rota" abre o caminho até o ponto do lugar', () => {
    expect(routeUrl(POINT)).toBe('https://www.google.com/maps/dir/?api=1&destination=-23.5614,-46.6559');
  });

  it('GRP-63: o endereço numa linha: "Rua X, 10 · Bairro · Cidade/UF"', () => {
    expect(
      addressLine({
        street: 'Rua das Palmeiras',
        number: '10',
        district: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        country: 'BR',
      }),
    ).toBe('Rua das Palmeiras, 10 · Centro · São Paulo/SP');
  });
});
