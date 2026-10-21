/** Badge — hidden at zero; shows 99+ above 99. */
function Badge({ count }) {
  if (!count) return null;
  return count > 99 ? '99+' : String(count);
}
