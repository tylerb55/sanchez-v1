import pdfplumber
from langchain_core.documents import Document

def parse_pdf_to_markdown(pdf_path):
    documents = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            page_elements = [] # To store (content_string, top_y_coordinate) for sorting

            # 1. Extract and process tables
            table_objects = page.find_tables()
            table_bboxes = [] # Keep track of bboxes to filter words later

            for t_obj in table_objects:
                md_table = ""
                table_data = t_obj.extract()
                if table_data:
                    # Clean up cells and create Markdown table
                    clean_table = [[(cell.replace('\n', ' ') if cell else "") for cell in row] for row in table_data]
                    if clean_table and len(clean_table[0]) > 0:
                        headers = clean_table[0]
                        md_table = f"\n| {' | '.join(headers)} |"
                        md_table += f"\n| {' | '.join(['---'] * len(headers))} |"
                        for row in clean_table[1:]:
                            # Ensure row length matches header length
                            if len(row) == len(headers):
                                md_table += f"\n| {' | '.join(row)} |"

                if md_table:
                    page_elements.append((md_table + "\n\n", t_obj.bbox[1])) # Store content and top_y for sorting
                    table_bboxes.append(t_obj.bbox)

            # 2. Extract words and filter out those within table bounding boxes
            all_words = page.extract_words(x_tolerance=1, y_tolerance=1) # Get precise word bboxes
            text_words = []

            for word in all_words:
                word_bbox = (word['x0'], word['top'], word['x1'], word['bottom'])
                is_in_table = False
                for t_bbox in table_bboxes:
                    # Check if the word's bbox is contained within the table's bbox
                    if (word_bbox[0] >= t_bbox[0] and word_bbox[1] >= t_bbox[1] and
                        word_bbox[2] <= t_bbox[2] and word_bbox[3] <= t_bbox[3]):
                        is_in_table = True
                        break
                if not is_in_table:
                    text_words.append(word)

            # 3. Reconstruct text from non-table words, maintaining line breaks
            if text_words:
                # Sort words by top-y and then left-x for natural reading order
                text_words.sort(key=lambda w: (w['top'], w['x0']))

                reconstructed_text = []
                current_line_y = -1
                current_line_words = []

                for word in text_words:
                    # Heuristic for new line: if y coordinate significantly changes
                    # This threshold might need tuning depending on document font sizes.
                    if current_line_y == -1 or abs(word['top'] - current_line_y) > 3:
                        if current_line_words:
                            reconstructed_text.append(" ".join([w['text'] for w in current_line_words]))
                        current_line_words = [word]
                        current_line_y = word['top']
                    else:
                        current_line_words.append(word)

                if current_line_words: # Add the last line
                    reconstructed_text.append(" ".join([w['text'] for w in current_line_words]))

                final_text_content = "\n".join(reconstructed_text).strip()

                if final_text_content:
                    # Use the top-y of the first word as the overall position for sorting
                    page_elements.append((final_text_content + "\n\n", text_words[0]['top']))

            # 4. Sort all elements (tables and reconstructed text blocks) by their top-Y coordinate
            page_elements.sort(key=lambda x: x[1]) # Sort by the stored top_y_coordinate

            # 5. Combine into final page_text
            final_page_text_combined = "".join([content for content, _ in page_elements])

            # 6. Wrap in LangChain Document
            new_doc = Document(
                page_content=final_page_text_combined.strip(),
                metadata={
                    "source": pdf_path,
                    "page": i + 1,
                    "has_table": len(table_objects) > 0
                }
            )
            documents.append(new_doc)

    return documents