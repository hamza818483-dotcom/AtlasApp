// ============================================================
// result-pdf.js — ATLAS Exam Result PDF Generator
// Uses jsPDF (loaded via CDN) to produce a 2-column solve sheet
// Premium + Colorful Design
// ============================================================

export async function generateResultPDF({ exam, resultMap, finalWithoutGPA, finalWithGPA, gpaScore, user }) {
  // jsPDF must be loaded via CDN in index.html:
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

  if (typeof window.jspdf === 'undefined') {
    alert('PDF লাইব্রেরি লোড হয়নি। পেইজ রিলোড করে আবার চেষ্টা করুন।');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210, pageH = 297;
  const margin = 12;
  const colW = (pageW - margin * 3) / 2;
  let col = 0; // 0 = left, 1 = right
  let y = margin;

  // ── Color Palette ──
  const colors = {
    primary:    [220, 38, 38],   // Red
    correct:    [34, 197, 94],   // Green
    wrong:      [239, 68, 68],   // Red
    skipped:    [148, 163, 184], // Gray
    bgHeader:   [15, 23, 42],    // Dark Blue
    bgCard:     [241, 245, 249], // Light Gray
    textDark:   [15, 23, 42],
    textMuted:  [100, 116, 139],
    white:      [255, 255, 255],
    gold:       [234, 179, 8],
    accent:     [59, 130, 246],  // Blue
  };

  function setFill(rgb) { doc.setFillColor(...rgb); }
  function setDraw(rgb) { doc.setDrawColor(...rgb); }
  function setTxt(rgb)  { doc.setTextColor(...rgb); }
  function setFont(size, style = 'normal') { doc.setFontSize(size); doc.setFont('helvetica', style); }

  // ═══════════════════════════════════════════
  // PAGE 1: COVER / RESULT SUMMARY
  // ═══════════════════════════════════════════

  // Header banner
  setFill(colors.bgHeader);
  doc.rect(0, 0, pageW, 50, 'F');

  // Logo text
  setTxt(colors.primary);
  setFont(28, 'bold');
  doc.text('ATLAS', margin, 22);

  setTxt(colors.white);
  setFont(11, 'normal');
  doc.text('EXAM RESULT', margin, 32);

  setTxt([180, 200, 220]);
  setFont(8);
  doc.text('atlasprep.com', margin, 40);

  // Exam title
  setTxt(colors.white);
  setFont(14, 'bold');
  const titleLines = doc.splitTextToSize(exam.title, pageW - margin * 2 - 60);
  doc.text(titleLines, pageW / 2, 20, { align: 'center' });
  setFont(9);
  setTxt([160, 200, 230]);
  doc.text(`${exam.subject} | ${exam.chapter}`, pageW / 2, 32, { align: 'center' });

  // Date
  setTxt([120, 160, 200]);
  setFont(8);
  doc.text(new Date().toLocaleString('en-BD'), pageW - margin, 44, { align: 'right' });

  y = 60;

  // Student info band
  if (user) {
    setFill([226, 232, 240]);
    doc.roundedRect(margin, y, pageW - margin * 2, 22, 3, 3, 'F');
    setTxt(colors.textDark);
    setFont(9, 'bold');
    doc.text(`পরীক্ষার্থী: ${user.name}`, margin + 5, y + 8);
    setFont(8, 'normal');
    setTxt(colors.textMuted);
    doc.text(`ব্যাচ: ${user.hsc_batch || '—'}  |  কলেজ: ${user.college_name || '—'}  |  ${user.timer_type === 'second' ? '২য় টাইমার' : '১ম টাইমার'}`, margin + 5, y + 16);
    y += 28;
  }

  // Score boxes (4 small boxes)
  const boxes = [
    { label: 'সঠিক', value: resultMap.correct, color: colors.correct },
    { label: 'ভুল', value: resultMap.wrong, color: colors.wrong },
    { label: 'এড়ানো', value: resultMap.skipped, color: colors.skipped },
    { label: 'নেগেটিভ', value: `−${(resultMap.wrong * resultMap.negativeMark).toFixed(2)}`, color: colors.primary },
  ];

  const bw = (pageW - margin * 5) / 4;
  boxes.forEach((box, i) => {
    const bx = margin + i * (bw + margin);
    setFill(box.color);
    doc.roundedRect(bx, y, bw, 22, 3, 3, 'F');
    setTxt(colors.white);
    setFont(16, 'bold');
    doc.text(String(box.value), bx + bw / 2, y + 12, { align: 'center' });
    setFont(7, 'normal');
    doc.text(box.label, bx + bw / 2, y + 19, { align: 'center' });
  });
  y += 30;

  // Final score section (2 big boxes)
  const finalBoxW = (pageW - margin * 3) / 2;

  // Without GPA box
  setFill(colors.accent);
  doc.roundedRect(margin, y, finalBoxW, 35, 4, 4, 'F');
  setTxt(colors.white);
  setFont(9);
  doc.text('GPA ছাড়া ফলাফল', margin + finalBoxW / 2, y + 8, { align: 'center' });
  setFont(22, 'bold');
  doc.text(`${finalWithoutGPA.toFixed(2)}`, margin + finalBoxW / 2, y + 24, { align: 'center' });
  setFont(8, 'normal');
  doc.text(`/ ${resultMap.totalMarks}`, margin + finalBoxW / 2, y + 32, { align: 'center' });

  // With GPA box
  if (user) {
    setFill(colors.gold);
    doc.roundedRect(margin * 2 + finalBoxW, y, finalBoxW, 35, 4, 4, 'F');
    setTxt(colors.textDark);
    setFont(9);
    doc.text('GPA সহ ফলাফল', margin * 2 + finalBoxW + finalBoxW / 2, y + 8, { align: 'center' });
    setFont(22, 'bold');
    doc.text(`${finalWithGPA.toFixed(2)}`, margin * 2 + finalBoxW + finalBoxW / 2, y + 24, { align: 'center' });
    setFont(8, 'normal');
    doc.text(`/ ${resultMap.totalMarks + 100}`, margin * 2 + finalBoxW + finalBoxW / 2, y + 32, { align: 'center' });
  }
  y += 42;

  // GPA breakdown
  if (user && gpaScore) {
    setFill([248, 250, 252]);
    doc.roundedRect(margin, y, pageW - margin * 2, 16, 2, 2, 'F');
    setTxt(colors.textMuted);
    setFont(7.5);
    doc.text(
      `SSC GPA ${user.ssc_gpa} × 8 = ${(parseFloat(user.ssc_gpa)*8).toFixed(2)}   |   HSC GPA ${user.hsc_gpa} × 12 = ${(parseFloat(user.hsc_gpa)*12).toFixed(2)}   |   GPA মোট = ${gpaScore.toFixed(2)}/100`,
      pageW / 2, y + 9, { align: 'center' }
    );
    y += 22;
  }

  // Section divider
  setFont(10, 'bold');
  setTxt(colors.bgHeader);
  doc.text('━━━  সম্পূর্ণ সমাধান পত্র  ━━━', pageW / 2, y + 6, { align: 'center' });
  y += 14;

  // ═══════════════════════════════════════════
  // SOLVE SHEET — 2 Columns
  // ═══════════════════════════════════════════

  col = 0;
  let yLeft = y, yRight = y;

  function getX() { return col === 0 ? margin : margin * 2 + colW; }
  function getY() { return col === 0 ? yLeft : yRight; }
  function setY(val) { if (col === 0) yLeft = val; else yRight = val; }

  function checkPageBreak(neededHeight) {
    const currentY = getY();
    if (currentY + neededHeight > pageH - margin) {
      if (col === 0) {
        col = 1;
        // If right col also full (shouldn't happen on first switch), add page
      } else {
        doc.addPage();
        yLeft = margin;
        yRight = margin;
        col = 0;
      }
    }
  }

  resultMap.perQuestion.forEach((item, idx) => {
    const opts = [
      item.question.option1, item.question.option2,
      item.question.option3, item.question.option4, item.question.option5
    ].filter(Boolean);

    // Estimate height: question lines + options + explanation
    const qLines = doc.splitTextToSize(`${idx+1}. ${item.question.question}`, colW - 6);
    const expLines = item.question.explanation
      ? doc.splitTextToSize(`💡 ${item.question.explanation}`, colW - 10)
      : [];
    const cardH = 8 + qLines.length * 4.5 + opts.length * 7 + (expLines.length ? expLines.length * 4 + 6 : 0) + 6;

    checkPageBreak(cardH);

    const cx = getX();
    const cy = getY();

    // Card background
    const bgColor = item.status === 'correct'
      ? [240, 253, 244]
      : item.status === 'wrong'
      ? [254, 242, 242]
      : [248, 250, 252];
    const borderColor = item.status === 'correct' ? colors.correct : item.status === 'wrong' ? colors.wrong : colors.skipped;

    setFill(bgColor);
    setDraw(borderColor);
    doc.setLineWidth(0.4);
    doc.roundedRect(cx, cy, colW, cardH, 2.5, 2.5, 'FD');

    // Status dot
    setFill(borderColor);
    doc.circle(cx + colW - 5, cy + 5, 2.5, 'F');

    // Question number + text
    setFont(7.5, 'bold');
    setTxt(colors.textDark);
    doc.text(`${idx + 1}.`, cx + 3, cy + 7);
    setFont(7.5, 'normal');
    doc.text(qLines, cx + 8, cy + 7);

    let optY = cy + 7 + qLines.length * 4.5 + 1;

    opts.forEach((opt, oi) => {
      const optNum = oi + 1;
      const isCorrect = optNum === item.correctAnswer;
      const isWrong = optNum === item.selected && item.selected !== item.correctAnswer;

      if (isCorrect) {
        setFill(colors.correct);
        doc.circle(cx + 6, optY - 1.5, 2, 'F');
        setTxt(colors.white);
        doc.setFontSize(5.5);
        doc.text('✓', cx + 4.8, optY - 0.5);
      } else if (isWrong) {
        setFill(colors.wrong);
        doc.circle(cx + 6, optY - 1.5, 2, 'F');
        setTxt(colors.white);
        doc.setFontSize(5.5);
        doc.text('✗', cx + 4.8, optY - 0.5);
      } else {
        setFill([200, 210, 220]);
        doc.circle(cx + 6, optY - 1.5, 2, 'F');
        setTxt(colors.textMuted);
        setFont(5.5, 'normal');
        doc.text(String.fromCharCode(64 + optNum), cx + 4.8, optY - 0.5);
      }

      setFont(7, isCorrect ? 'bold' : 'normal');
      setTxt(isCorrect ? [20, 80, 40] : isWrong ? [120, 20, 20] : colors.textDark);
      const optLines = doc.splitTextToSize(opt, colW - 14);
      doc.text(optLines, cx + 10, optY);
      optY += optLines.length * 4 + 2.5;
    });

    // Explanation
    if (expLines.length) {
      setFill([255, 251, 235]);
      doc.roundedRect(cx + 2, optY, colW - 4, expLines.length * 4 + 4, 1.5, 1.5, 'F');
      setFont(6.5, 'italic');
      setTxt([120, 80, 10]);
      doc.text(expLines, cx + 4, optY + 4);
      optY += expLines.length * 4 + 7;
    }

    setY(cy + cardH + 3);
  });

  // Footer on last page
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setFill(colors.bgHeader);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    setTxt(colors.white);
    setFont(7);
    doc.text('ATLAS — atlasprep.com', margin, pageH - 4);
    doc.text(`পৃষ্ঠা ${p} / ${totalPages}`, pageW / 2, pageH - 4, { align: 'center' });
    doc.text(new Date().toLocaleDateString('en-BD'), pageW - margin, pageH - 4, { align: 'right' });
  }

  // Save
  const filename = `${exam.title.replace(/\s+/g, '_')}_result.pdf`;
  doc.save(filename);
}
