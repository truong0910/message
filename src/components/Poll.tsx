import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import { Modal, Form, Button, ProgressBar, Badge } from 'react-bootstrap';
import type { Poll, PollVote } from '../types';

interface CreatePollProps {
  show: boolean;
  onHide: () => void;
  conversationId: number;
  onPollCreated?: (poll: Poll) => void;
}

export const CreatePoll: React.FC<CreatePollProps> = ({
  show,
  onHide,
  conversationId,
  onPollCreated,
}) => {
  const { user } = useUser();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [creating, setCreating] = useState(false);

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleCreate = async () => {
    if (!user || !question.trim() || options.filter(o => o.trim()).length < 2) return;

    setCreating(true);

    try {
      // Create poll
      const { data: pollData, error: pollError } = await supabase
        .from('polls')
        .insert({
          conversation_id: conversationId,
          creator_id: user.id,
          question: question.trim(),
          is_multiple_choice: isMultipleChoice,
          is_anonymous: isAnonymous,
        })
        .select()
        .single();

      if (pollError || !pollData) {
        console.error('Error creating poll:', pollError);
        return;
      }

      // Create options
      const validOptions = options.filter(o => o.trim());
      const { data: optionsData, error: optionsError } = await supabase
        .from('poll_options')
        .insert(
          validOptions.map(opt => ({
            poll_id: pollData.id,
            option_text: opt.trim(),
          }))
        )
        .select();

      if (optionsError) {
        console.error('Error creating options:', optionsError);
        return;
      }

      // Create message with poll
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `📊 ${question}`,
        message_type: 'poll',
      });

      onPollCreated?.({ ...pollData, options: optionsData || [] });
      
      // Reset form
      setQuestion('');
      setOptions(['', '']);
      setIsMultipleChoice(false);
      setIsAnonymous(false);
      onHide();
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header 
        closeButton 
        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
      >
        <Modal.Title className="text-white">
          📊 Tạo bình chọn
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Câu hỏi</Form.Label>
          <Form.Control
            type="text"
            placeholder="Nhập câu hỏi..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Các lựa chọn</Form.Label>
          {options.map((opt, index) => (
            <div key={index} className="d-flex gap-2 mb-2">
              <Form.Control
                type="text"
                placeholder={`Lựa chọn ${index + 1}`}
                value={opt}
                onChange={(e) => updateOption(index, e.target.value)}
              />
              {options.length > 2 && (
                <Button
                  variant="outline-danger"
                  onClick={() => removeOption(index)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <Button variant="outline-primary" size="sm" onClick={addOption}>
              + Thêm lựa chọn
            </Button>
          )}
        </Form.Group>

        <Form.Check
          type="checkbox"
          label="Cho phép chọn nhiều"
          checked={isMultipleChoice}
          onChange={(e) => setIsMultipleChoice(e.target.checked)}
          className="mb-2"
        />
        <Form.Check
          type="checkbox"
          label="Bình chọn ẩn danh"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="mb-3"
        />

        <Button
          onClick={handleCreate}
          disabled={creating || !question.trim() || options.filter(o => o.trim()).length < 2}
          className="w-100"
          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
        >
          {creating ? 'Đang tạo...' : 'Tạo bình chọn'}
        </Button>
      </Modal.Body>
    </Modal>
  );
};

// Display Poll Component
interface PollDisplayProps {
  pollId: number;
}

export const PollDisplay: React.FC<PollDisplayProps> = ({ pollId }) => {
  const { user } = useUser();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    fetchPoll();
  }, [pollId]);

  const fetchPoll = async () => {
    setLoading(true);
    
    // Fetch poll with options
    const { data: pollData } = await supabase
      .from('polls')
      .select(`
        *,
        poll_options (*)
      `)
      .eq('id', pollId)
      .single();

    if (pollData) {
      setPoll(pollData);
    }

    // Fetch votes
    const { data: votesData } = await supabase
      .from('poll_votes')
      .select('*')
      .eq('poll_id', pollId);

    if (votesData) {
      setVotes(votesData);
    }

    setLoading(false);
  };

  const handleVote = async (optionId: number) => {
    if (!user || !poll) return;

    setVoting(true);

    const existingVote = votes.find(
      v => v.option_id === optionId && v.user_id === user.id
    );

    if (existingVote) {
      // Remove vote
      await supabase
        .from('poll_votes')
        .delete()
        .eq('id', existingVote.id);

      setVotes(prev => prev.filter(v => v.id !== existingVote.id));
    } else {
      // Add vote (remove existing if not multiple choice)
      if (!poll.is_multiple_choice) {
        await supabase
          .from('poll_votes')
          .delete()
          .eq('poll_id', pollId)
          .eq('user_id', user.id);

        setVotes(prev => prev.filter(v => v.user_id !== user.id));
      }

      const { data } = await supabase
        .from('poll_votes')
        .insert({
          poll_id: pollId,
          option_id: optionId,
          user_id: user.id,
        })
        .select()
        .single();

      if (data) {
        setVotes(prev => [...prev, data]);
      }
    }

    setVoting(false);
  };

  if (loading || !poll) {
    return <div className="text-muted small">Đang tải bình chọn...</div>;
  }

  const totalVotes = votes.length;
  const userVotes = votes.filter(v => v.user_id === user?.id).map(v => v.option_id);

  return (
    <div className="poll-container p-3 bg-white rounded shadow-sm">
      <div className="fw-bold mb-3 d-flex align-items-center gap-2">
        📊 {poll.question}
        {poll.is_anonymous && <Badge bg="secondary">Ẩn danh</Badge>}
        {poll.is_multiple_choice && <Badge bg="info">Nhiều lựa chọn</Badge>}
      </div>

      {poll.options?.map((option) => {
        const optionVotes = votes.filter(v => v.option_id === option.id).length;
        const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
        const isSelected = userVotes.includes(option.id);

        return (
          <div
            key={option.id}
            className={`poll-option mb-2 p-2 rounded border ${isSelected ? 'border-primary' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => !voting && handleVote(option.id)}
          >
            <div className="d-flex justify-content-between mb-1">
              <span className={isSelected ? 'fw-bold text-primary' : ''}>
                {isSelected && '✓ '}{option.option_text}
              </span>
              <span className="text-muted small">{optionVotes} phiếu ({percentage}%)</span>
            </div>
            <ProgressBar
              now={percentage}
              variant={isSelected ? 'primary' : 'secondary'}
              style={{ height: '8px' }}
            />
          </div>
        );
      })}

      <div className="text-muted small mt-2">
        Tổng: {totalVotes} phiếu bầu
      </div>
    </div>
  );
};

export default CreatePoll;
