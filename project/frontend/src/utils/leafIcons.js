import {
  FileText, Link2, Image, Star, Bookmark, Tag, Hash,
  Lightbulb, Target, BookOpen, Palette, Trophy, MessageSquare,
  BarChart2, Music, Film, Monitor, Globe, DollarSign, Calendar,
  FlaskConical, Dice5, Key, Mail, Brain, Leaf, Zap, CheckSquare,
  Camera, MapPin, Flame, Heart,
} from 'lucide-react'

// Ordered list used for rendering the picker grid
export const LEAF_ICON_LIST = [
  { key: 'FileText',      Icon: FileText },
  { key: 'Link2',         Icon: Link2 },
  { key: 'Image',         Icon: Image },
  { key: 'Camera',        Icon: Camera },
  { key: 'Star',          Icon: Star },
  { key: 'Bookmark',      Icon: Bookmark },
  { key: 'Tag',           Icon: Tag },
  { key: 'Hash',          Icon: Hash },
  { key: 'Lightbulb',     Icon: Lightbulb },
  { key: 'Target',        Icon: Target },
  { key: 'BookOpen',      Icon: BookOpen },
  { key: 'Palette',       Icon: Palette },
  { key: 'Trophy',        Icon: Trophy },
  { key: 'MessageSquare', Icon: MessageSquare },
  { key: 'BarChart2',     Icon: BarChart2 },
  { key: 'Music',         Icon: Music },
  { key: 'Film',          Icon: Film },
  { key: 'Monitor',       Icon: Monitor },
  { key: 'Globe',         Icon: Globe },
  { key: 'DollarSign',    Icon: DollarSign },
  { key: 'Calendar',      Icon: Calendar },
  { key: 'FlaskConical',  Icon: FlaskConical },
  { key: 'Dice5',         Icon: Dice5 },
  { key: 'Key',           Icon: Key },
  { key: 'Mail',          Icon: Mail },
  { key: 'Brain',         Icon: Brain },
  { key: 'Leaf',          Icon: Leaf },
  { key: 'Zap',           Icon: Zap },
  { key: 'CheckSquare',   Icon: CheckSquare },
  { key: 'MapPin',        Icon: MapPin },
  { key: 'Flame',         Icon: Flame },
  { key: 'Heart',         Icon: Heart },
]

// Map for O(1) lookup by key
export const LEAF_ICON_MAP = Object.fromEntries(
  LEAF_ICON_LIST.map(({ key, Icon }) => [key, Icon])
)

// Default icon per note type (fallback for old notes without an icono)
export const DEFAULT_LEAF_ICON = {
  link:  'Link2',
  foto:  'Image',
  texto: 'FileText',
}

export function getLeafIcon(icono, tipo) {
  const key = icono || DEFAULT_LEAF_ICON[tipo] || 'FileText'
  return LEAF_ICON_MAP[key] || LEAF_ICON_MAP['FileText']
}
