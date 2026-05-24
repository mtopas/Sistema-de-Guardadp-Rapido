export const MONTHS = [
  { v: '01', es: 'Enero',      en: 'January'   },
  { v: '02', es: 'Febrero',    en: 'February'  },
  { v: '03', es: 'Marzo',      en: 'March'     },
  { v: '04', es: 'Abril',      en: 'April'     },
  { v: '05', es: 'Mayo',       en: 'May'       },
  { v: '06', es: 'Junio',      en: 'June'      },
  { v: '07', es: 'Julio',      en: 'July'      },
  { v: '08', es: 'Agosto',     en: 'August'    },
  { v: '09', es: 'Septiembre', en: 'September' },
  { v: '10', es: 'Octubre',    en: 'October'   },
  { v: '11', es: 'Noviembre',  en: 'November'  },
  { v: '12', es: 'Diciembre',  en: 'December'  },
]

export const MONTH_NAMES_ES = MONTHS.map(m => m.es)
export const MONTH_NAMES_SHORT_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export function monthName(v, lang = 'es') {
  const m = MONTHS.find(x => x.v === String(v).padStart(2, '0'))
  return m ? (lang === 'en' ? m.en : m.es) : ''
}
