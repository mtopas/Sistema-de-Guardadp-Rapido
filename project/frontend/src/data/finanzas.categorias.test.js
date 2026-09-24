import { describe, it, expect } from 'vitest'
import { pickDefaultCategoria } from './finanzas.js'
import {
  isFinCategoriaObjetivo,
  isFinCategoriaReservada,
  categoriaAplicaATipo,
  filterCategoriasPorTipo,
} from './finCategorias.js'

describe('isFinCategoriaObjetivo', () => {
  it('true para un objetivo_id válido, incluso 0 (id válido, aunque sea falsy)', () => {
    expect(isFinCategoriaObjetivo({ objetivo_id: 123 })).toBe(true)
    expect(isFinCategoriaObjetivo({ objetivo_id: 0 })).toBe(true)
  })

  it('false para null, undefined o string vacío', () => {
    expect(isFinCategoriaObjetivo({ objetivo_id: null })).toBe(false)
    expect(isFinCategoriaObjetivo({ objetivo_id: undefined })).toBe(false)
    expect(isFinCategoriaObjetivo({ objetivo_id: '' })).toBe(false)
  })
})

describe('isFinCategoriaReservada', () => {
  it('acepta objeto categoría completo: reservada si tiene objetivo_id o nombre de sistema', () => {
    expect(isFinCategoriaReservada({ objetivo_id: 123 })).toBe(true)
    expect(isFinCategoriaReservada({ name: 'FIRE' })).toBe(true)
    expect(isFinCategoriaReservada({ name: 'OtraCategoria' })).toBe(false)
    expect(isFinCategoriaReservada({ name: null })).toBe(false)
  })

  it('acepta directamente un string con el nombre', () => {
    expect(isFinCategoriaReservada('FIRE')).toBe(true)
    expect(isFinCategoriaReservada('Transferencia')).toBe(true)
    expect(isFinCategoriaReservada('OtraCategoria')).toBe(false)
  })
})

describe('categoriaAplicaATipo', () => {
  it('Transferencia aplica a cualquier tipoMov, sin importar su propio campo tipo', () => {
    expect(categoriaAplicaATipo({ name: 'Transferencia' }, 'income')).toBe(true)
    expect(categoriaAplicaATipo({ name: 'Transferencia' }, 'expense')).toBe(true)
  })

  it('tipo "both" aplica a cualquier tipoMov', () => {
    expect(categoriaAplicaATipo({ tipo: 'both' }, 'income')).toBe(true)
    expect(categoriaAplicaATipo({ tipo: 'both' }, 'expense')).toBe(true)
  })

  it('categoría con tipo específico solo aplica a ese tipoMov exacto', () => {
    expect(categoriaAplicaATipo({ tipo: 'income' }, 'income')).toBe(true)
    expect(categoriaAplicaATipo({ tipo: 'income' }, 'expense')).toBe(false)
  })

  it('cat null/undefined da false', () => {
    expect(categoriaAplicaATipo(null, 'income')).toBe(false)
    expect(categoriaAplicaATipo(undefined, 'income')).toBe(false)
  })
})

describe('filterCategoriasPorTipo', () => {
  // FIRE sin campo `tipo` explícito => cae al default 'expense' (mismo criterio que
  // categoriaAplicaATipo: `cat.tipo ?? 'expense'`).
  const categorias = [
    { name: 'Salary', tipo: 'income' },
    { name: 'Transferencia', tipo: 'both' },
    { name: 'Groceries', tipo: 'expense' },
    { name: 'FIRE', objetivo_id: 123 },
  ]

  it('tipoMov "income": incluye Salary (match exacto) y Transferencia (siempre aplica); FIRE queda afuera (default expense)', () => {
    expect(filterCategoriasPorTipo(categorias, 'income')).toEqual([
      { name: 'Salary', tipo: 'income' },
      { name: 'Transferencia', tipo: 'both' },
    ])
  })

  it('tipoMov "expense": incluye Transferencia, Groceries y FIRE (default expense)', () => {
    expect(filterCategoriasPorTipo(categorias, 'expense')).toEqual([
      { name: 'Transferencia', tipo: 'both' },
      { name: 'Groceries', tipo: 'expense' },
      { name: 'FIRE', objetivo_id: 123 },
    ])
  })

  it('tipoMov "both": solo matchea categorías cuyo PROPIO tipo sea "both" (no es un comodín para todas)', () => {
    expect(filterCategoriasPorTipo(categorias, 'both')).toEqual([
      { name: 'Transferencia', tipo: 'both' },
    ])
  })

  it('Transferencia aplica incluso con un tipoMov que ninguna otra categoría matchea', () => {
    expect(filterCategoriasPorTipo(categorias, 'tipo_inexistente')).toEqual([
      { name: 'Transferencia', tipo: 'both' },
    ])
  })

  it('lista vacía da array vacío', () => {
    expect(filterCategoriasPorTipo([], 'income')).toEqual([])
  })
})

describe('pickDefaultCategoria', () => {
  // Transferencia queda deliberadamente afuera del pool (comentario fuente: "nunca
  // Transferencia") — nunca puede ser el resultado de esta función.
  const categorias = [
    { name: 'Salary', tipo: 'income' },
    { name: 'Transferencia', tipo: 'both' },
    { name: 'Groceries', tipo: 'expense' },
    { name: 'FIRE', objetivo_id: 123 },
  ]

  it('ignora lastSaved si es Transferencia, cae al pool general', () => {
    expect(pickDefaultCategoria(categorias, 'income', 'Transferencia')).toBe('Salary')
  })

  it('lista vacía da string vacío', () => {
    expect(pickDefaultCategoria([], 'income', 'Salary')).toBe('')
  })

  it('lastSaved válido pero de tipo distinto al pedido: no aplica el atajo, usa el pool general (primera del pool, no lastSaved)', () => {
    // lastSaved="Salary" (tipo income) con tipoMov="tipo_raro": la condición de atajo
    // (t==='both' || t===tipoMov) da false, así que NO devuelve "Salary" -- cae al pool
    // filtrado por la rama "else" (todo lo que no sea income), que da [Groceries, FIRE].
    expect(pickDefaultCategoria(categorias, 'tipo_raro', 'Salary')).toBe('Groceries')
  })

  it('lastSaved matchea el tipoMov pedido: devuelve lastSaved directo (atajo)', () => {
    expect(pickDefaultCategoria(categorias, 'income', 'Salary')).toBe('Salary')
  })

  it('tipoMov "both": Transferencia NUNCA es el resultado (está excluida del pool); devuelve la primera del pool general', () => {
    expect(pickDefaultCategoria(categorias, 'both', 'Salary')).toBe('Groceries')
  })

  it('tipoMov "expense": devuelve la categoría específica de ese tipo dentro del pool', () => {
    expect(pickDefaultCategoria(categorias, 'expense', 'Salary')).toBe('Groceries')
  })
})
