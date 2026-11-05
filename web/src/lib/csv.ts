/** Excel용 UTF-8 BOM + CRLF. 모든 셀을 인용해 열·행 경계도 보호한다. */
export function encodeCsv(rows: readonly (readonly string[])[]): string {
  const cell = (value: string) => {
    // 공백·제어문자 뒤의 수식 시작 문자와 전각 문자도 검사한다.
    // Excel에서 최초로 열 때 수식으로 평가하지 않도록 인용된 셀 안에 탭을 붙인다.
    const dangerous = /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u.test(value)
      || /^\p{Cc}/u.test(value);
    const text = dangerous ? `\t${value}` : value;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
