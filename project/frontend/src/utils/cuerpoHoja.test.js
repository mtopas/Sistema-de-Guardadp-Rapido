import { describe, it, expect } from 'vitest'
import { tituloDesdeCuerpo, textoPlanoAHtml, primerLinkEnCuerpo } from './cuerpoHoja'

// Regresión T3-A (#12 + #13): el título de una nota rápida se autogenera de la
// primera línea del cuerpo, nunca queda vacío y se trunca a un tope razonable.
describe('tituloDesdeCuerpo', () => {
  it('usa la primera línea no vacía del cuerpo', () => {
    expect(tituloDesdeCuerpo('Comprar pan\ny más cosas')).toBe('Comprar pan')
  })

  it('saltea líneas en blanco al principio', () => {
    expect(tituloDesdeCuerpo('\n\n   \nPrimera real\notra')).toBe('Primera real')
  })

  it('cuando la primera línea es solo un link, deriva el dominio sin www', () => {
    expect(tituloDesdeCuerpo('https://www.ejemplo.com/ruta/larga?x=1')).toBe('ejemplo.com')
  })

  it('con texto + link conserva el texto y descarta la URL cruda', () => {
    expect(tituloDesdeCuerpo('Ver esto https://ejemplo.com/post ahora')).toBe('Ver esto ahora')
  })

  it('cuerpo vacío o solo espacios devuelve "Sin título"', () => {
    expect(tituloDesdeCuerpo('')).toBe('Sin título')
    expect(tituloDesdeCuerpo('   \n  \n')).toBe('Sin título')
    expect(tituloDesdeCuerpo(null)).toBe('Sin título')
    expect(tituloDesdeCuerpo(undefined)).toBe('Sin título')
  })

  it('quita marcadores Markdown de apertura (encabezado, viñeta, lista, cita)', () => {
    expect(tituloDesdeCuerpo('# Título con hash')).toBe('Título con hash')
    expect(tituloDesdeCuerpo('- item de lista')).toBe('item de lista')
    expect(tituloDesdeCuerpo('1. primero')).toBe('primero')
    expect(tituloDesdeCuerpo('> cita')).toBe('cita')
  })

  it('trunca a la longitud máxima', () => {
    const largo = 'a'.repeat(200)
    expect(tituloDesdeCuerpo(largo).length).toBe(80)
    expect(tituloDesdeCuerpo(largo, 10)).toBe('a'.repeat(10))
  })

  it('no acepta caracteres de control ni rompe con contenido raro', () => {
    // Un título con caracteres inválidos para Windows NO se sanea acá (lo hace
    // el backend al nombrar el archivo); acá solo verificamos que no explota.
    expect(() => tituloDesdeCuerpo('a:b*c?d')).not.toThrow()
    expect(tituloDesdeCuerpo('a:b*c?d')).toBe('a:b*c?d')
  })
})

describe('textoPlanoAHtml', () => {
  it('envuelve un párrafo simple en <p>', () => {
    expect(textoPlanoAHtml('hola mundo')).toBe('<p>hola mundo</p>')
  })

  it('separa párrafos por línea en blanco y salto simple en <br>', () => {
    expect(textoPlanoAHtml('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>')
  })

  it('escapa HTML del usuario', () => {
    expect(textoPlanoAHtml('<script>x</script>')).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>')
  })

  it('cuerpo vacío devuelve string vacío', () => {
    expect(textoPlanoAHtml('')).toBe('')
    expect(textoPlanoAHtml('   ')).toBe('')
  })
})

// Regresión T3-B (#10): la preview cuelga del primer link del cuerpo, en
// cualquier posición; sin link no hay preview.
describe('primerLinkEnCuerpo', () => {
  it('encuentra el primer link cuando hay varios', () => {
    expect(primerLinkEnCuerpo('texto https://uno.com y https://dos.com'))
      .toBe('https://uno.com')
  })

  it('encuentra un link en el medio del cuerpo', () => {
    expect(primerLinkEnCuerpo('bla bla https://ejemplo.com/x final')).toBe('https://ejemplo.com/x')
  })

  it('lo encuentra dentro de HTML (apuntes de TipTap)', () => {
    expect(primerLinkEnCuerpo('<p>mirá <a href="https://ejemplo.com">acá</a></p>'))
      .toBe('https://ejemplo.com')
  })

  it('devuelve null cuando no hay link', () => {
    expect(primerLinkEnCuerpo('solo texto plano')).toBeNull()
    expect(primerLinkEnCuerpo('')).toBeNull()
    expect(primerLinkEnCuerpo(null)).toBeNull()
  })

  it('recorta puntuación final pegada a la URL', () => {
    expect(primerLinkEnCuerpo('fijate en https://ejemplo.com.')).toBe('https://ejemplo.com')
  })
})
