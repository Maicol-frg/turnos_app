/*
 * Catálogo de servicios de Beatifull Nails.
 *
 * Este archivo reemplaza a SERVICIOS_CATALOGO que antes vivía en js/config.js.
 * Vive en el backend porque el precio que se cobra (Stripe, o el que ve la
 * dueña para aprobar un pago en efectivo) siempre debe salir de una única
 * fuente confiable — nunca del navegador del cliente, que alguien podría
 * manipular antes de enviar la petición.
 *
 * El frontend pide este catálogo por la API (GET /api/servicios) en vez de
 * traerlo escrito en su propio código.
 */

const SERVICIOS = [
  { id: 'semimanos', nombre: 'Semipermanente manos+uñas (mujer)', precio: 55000 },
  { id: 'semipies', nombre: 'Semipermanente pies (mujer)', precio: 40000 },
  { id: 'semihombre', nombre: 'Semipermanente mano (hombre)', precio: 35000 },
  { id: 'semipies2', nombre: 'Semipermanente pies (hombre)', precio: 25000 },
  { id: 'dipping', nombre: 'Dipping', precio: 70000 },
  { id: 'gel', nombre: 'Gel', precio: 65000 },
  { id: 'presson', nombre: 'Press On', precio: 80000 },
  { id: 'acrilico', nombre: 'Acrílico', precio: 85000 },
  { id: 'polygel', nombre: 'Polygel', precio: 75000 },
  { id: 'forrado', nombre: 'Forrado de acrílico', precio: 80000 },
  { id: 'acriesculpido', nombre: 'Acrílico esculpido', precio: 100000 },
  { id: 'acriencapsulado', nombre: 'Acrílico esculpido + encapsulado', precio: 120000 },
  { id: 'gelrubber', nombre: 'Gel rubber', precio: 55000 },
  { id: 'buildergel', nombre: 'Builder gel', precio: 60000 },
  { id: 'retoque', nombre: 'Retoque', precio: -15000 }
];

function buscarServicio(id) {
  return SERVICIOS.find(s => s.id === id) || null;
}

module.exports = { SERVICIOS, buscarServicio };
