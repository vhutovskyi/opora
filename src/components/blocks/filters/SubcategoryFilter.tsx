"use client";

import type { SubcategoryNode } from "@/lib/supabase/subcategoryTree";

// All the ids of a node and its descendants — so that picking a parent also marks the whole branch below it.
const collectSubIds = (nodes: SubcategoryNode[]): string[] =>
  nodes.flatMap((n) => [n.id, ...collectSubIds(n.children)]);

// A checkbox list of subcategories — recursive, so any depth of the tree is reachable in the filter.
// Multi-select: several nodes can be marked at once (including ones from different branches).
export function SubcategoryCheckboxes({
  nodes,
  activeSubs,
  onToggle,
  depth,
}: {
  nodes: SubcategoryNode[];
  activeSubs: string[];
  onToggle: (id: string, descendantIds: string[]) => void;
  depth: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isChecked = activeSubs.includes(node.id);
        return (
          <div key={node.id} className={depth > 0 ? "ml-4 border-l border-opora-brown/10 pl-3" : ""}>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-4 h-4 border transition-colors flex items-center justify-center shrink-0 ${isChecked ? 'bg-opora-brown border-opora-brown' : 'border-opora-brown/40 group-hover:border-opora-brown'}`}>
                {isChecked && <span className="text-white text-xs leading-none">✓</span>}
              </div>
              <span className={depth > 0 ? "text-base font-light" : "text-lg font-light"}>{node.name}</span>
              <input
                type="checkbox"
                className="hidden"
                checked={isChecked}
                onChange={() => onToggle(node.id, collectSubIds(node.children))}
              />
            </label>
            <SubcategoryCheckboxes nodes={node.children} activeSubs={activeSubs} onToggle={onToggle} depth={depth + 1} />
          </div>
        );
      })}
    </>
  );
}

export interface SubcategoryFilterProps {
  nodes: SubcategoryNode[];
  activeSubs: string[];
  onToggle: (id: string, descendantIds: string[]) => void;
  onClear: () => void;
}

export function SubcategoryFilter({ nodes, activeSubs, onToggle, onClear }: SubcategoryFilterProps) {
  return (
    <>
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className={`w-4 h-4 border transition-colors flex items-center justify-center ${activeSubs.length === 0 ? 'bg-opora-brown border-opora-brown' : 'border-opora-brown/40 group-hover:border-opora-brown'}`}>
          {activeSubs.length === 0 && <span className="text-white text-xs leading-none">✓</span>}
        </div>
        <span className="text-lg font-light">Всі</span>
        <input type="checkbox" className="hidden" checked={activeSubs.length === 0} onChange={onClear} />
      </label>
      <SubcategoryCheckboxes nodes={nodes} activeSubs={activeSubs} onToggle={onToggle} depth={0} />
    </>
  );
}
