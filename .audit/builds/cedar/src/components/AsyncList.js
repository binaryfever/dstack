/** AsyncList — switches empty, loading, failed, populated slots. */
function AsyncList({ empty, loading, failed, populated, status }) {
  if (status === 'loading') return loading;
  if (status === 'empty') return empty;
  if (status === 'failed') return failed;
  return populated;
}
