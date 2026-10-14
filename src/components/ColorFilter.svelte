<script lang="ts">
  let { label, value, mode, onchange, onmode }: { label: string; value: string; mode: '<=' | '>=' | '='; onchange: (value: string) => void; onmode: (mode: '<=' | '>=' | '=') => void } = $props();
  const colors = [{ code: 'w', name: 'White' }, { code: 'u', name: 'Blue' }, { code: 'b', name: 'Black' }, { code: 'r', name: 'Red' }, { code: 'g', name: 'Green' }, { code: 'c', name: 'Colorless' }];
  function toggle(code: string, checked: boolean) {
    if (code === 'c') { onchange(checked ? 'c' : ''); return; }
    const selected = new Set(value.replace('c', '').split(''));
    if (checked) selected.add(code); else selected.delete(code);
    onchange('wubrg'.split('').filter(c => selected.has(c)).join(''));
  }
</script>
<fieldset class="color-filter"><legend>{label}</legend><div class="color-choices">{#each colors as color}<label class="checkbox-label"><input type="checkbox" checked={value.includes(color.code)} onchange={(e) => toggle(color.code, e.currentTarget.checked)} />{color.name}</label>{/each}</div><select aria-label={`${label} matching`} value={mode} onchange={(e) => onmode(e.currentTarget.value as typeof mode)}><option value="<=">Within selected colors</option><option value="=">Exactly selected colors</option><option value=">=">Includes selected colors</option></select></fieldset>
